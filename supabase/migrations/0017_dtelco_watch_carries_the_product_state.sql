-- The two watcher views read one contact keyed table, and here is why they have to.
--
-- v_dtelco_price_watchers and v_dtelco_stock_waiters_with_stock select the people waiting on a
-- product to come back into stock or to drop in price. Both once joined dtelco_product to read a
-- title, a price and a stock count.
--
-- Every view here carries security_invoker = true, so a view runs with the permissions of whoever
-- selects it. dengage_reader has no grant on dtelco_product and must not have one: reference
-- tables about products or places are never offered as remote sources. A view that joins a table
-- the reporting role cannot read therefore resolves for the service role and fails for the role
-- the platform connects with.
--
-- The fix is not a grant on dtelco_product, which would put the catalogue in the remote source
-- picker, and not security_invoker = false, which every view here keeps. Instead the watch row
-- carries the state of the product it watches, refreshed by trigger.
--
-- That is also how an operator does it in production. A commerce system knows a product came back
-- into stock and tells the customer data platform which customers are waiting; it does not hand
-- over its product catalogue and ask the platform to work the join out. The segment stays contact
-- keyed, the product table stays unconnectable, and the count moves the moment stock or price
-- changes.

alter table public.dtelco_watch
  add column if not exists product_title            text,
  add column if not exists watched_price            numeric(12,2),
  add column if not exists watched_discounted_price numeric(12,2),
  add column if not exists watched_stock_count      integer,
  add column if not exists state_refreshed_at       timestamptz;

comment on column public.dtelco_watch.watched_stock_count is
  'The stock of the watched product, copied here by trigger. The segment reads this rather than joining dtelco_product, because dengage_reader cannot read that table and must never be able to.';

-- Refresh one watch row from the product it names. Runs as the function owner, so it reads
-- dtelco_product regardless of who caused the write.
create or replace function public.dtelco_watch_fill_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select p.title, p.price, p.discounted_price, p.stock_count
    into new.product_title, new.watched_price, new.watched_discounted_price, new.watched_stock_count
    from public.dtelco_product p
   where p.product_id = new.product_id;
  new.state_refreshed_at := now();
  return new;
end $$;

drop trigger if exists dtelco_watch_fill_state_trg on public.dtelco_watch;
create trigger dtelco_watch_fill_state_trg
  before insert or update of product_id on public.dtelco_watch
  for each row execute function public.dtelco_watch_fill_state();

-- When a product's price or stock changes, every row watching it follows. This is the trigger the
-- restock and the price drop actually fire, and it is why the segment fills on the press.
create or replace function public.dtelco_product_push_state_to_watchers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.dtelco_watch w
     set product_title            = new.title,
         watched_price            = new.price,
         watched_discounted_price = new.discounted_price,
         watched_stock_count      = new.stock_count,
         state_refreshed_at       = now()
   where w.product_id = new.product_id;
  return null;
end $$;

drop trigger if exists dtelco_product_push_state_trg on public.dtelco_product;
create trigger dtelco_product_push_state_trg
  after update of price, discounted_price, stock_count, title on public.dtelco_product
  for each row execute function public.dtelco_product_push_state_to_watchers();

-- Backfill the rows that already exist.
update public.dtelco_watch w
   set product_title            = p.title,
       watched_price            = p.price,
       watched_discounted_price = p.discounted_price,
       watched_stock_count      = p.stock_count,
       state_refreshed_at       = now()
  from public.dtelco_product p
 where p.product_id = w.product_id
   and w.state_refreshed_at is null;

-- The two views, reading one contact keyed table and nothing else.
--
-- Dropped and recreated rather than replaced: create or replace cannot change a view column's
-- type, and price moved from the product table's numeric to the watch row's copy of it.
drop view if exists public.v_dtelco_price_watchers;
create view public.v_dtelco_price_watchers
with (security_invoker = true) as
  select w.contact_key,
         w.product_id,
         w.product_title,
         w.watched_price            as price,
         w.watched_discounted_price as discounted_price,
         (w.watched_price - w.watched_discounted_price) as saving
    from public.dtelco_watch w
   where w.list_name = 'price_drop_alert'
     and w.watched_price is not null
     and w.watched_discounted_price is not null
     and w.watched_discounted_price < w.watched_price;

drop view if exists public.v_dtelco_stock_waiters_with_stock;
create view public.v_dtelco_stock_waiters_with_stock
with (security_invoker = true) as
  select w.contact_key,
         w.product_id,
         w.product_title,
         w.watched_price as price,
         w.watched_stock_count as stock_count,
         w.created_at
    from public.dtelco_watch w
   where w.list_name = 'back_in_stock_alert'
     and w.watched_stock_count is not null
     and w.watched_stock_count > 0;

grant select on public.v_dtelco_price_watchers to dengage_reader;
grant select on public.v_dtelco_stock_waiters_with_stock to dengage_reader;
