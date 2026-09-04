-- The order, server side.
--
-- Until now an order existed in two places and neither was a record. The browser kept it in local
-- storage so the orders page could draw it, and ec:order told Dengage about it as an event. Both
-- are real, and neither survives the thing that actually happens in a shop: the visitor closes the
-- tab.
--
-- That is also the argument for reference/upsertorders existing at all. ec:order writes
-- order_events and order_events_detail, which are behavioural rows about a session. upsertorders
-- writes orders and orders_detail, which are the operator's record of what was bought. They are
-- different table families answering different questions, and a real integration usually feeds
-- both: the browser for the moment, the backend for the truth.
--
-- So the order lands here first, then Dengage is called, then the answer is written back onto the
-- row. The same order the relay uses, and for the same reason: an HTTP 200 means accepted, and the
-- row is the only artifact that can tell accepted from stored afterwards.
create table if not exists public.dtelco_order (
  order_id        text primary key,
  contact_key     text not null,
  order_date      timestamptz not null default now(),
  -- reference/upsertorders closes this to two values: "order_status = success / refund". There is
  -- no shipped and no delivered, which is why fulfilment is a custom event instead.
  order_status    text not null default 'success',
  -- web / mobile_app / offline, from the same page.
  order_source    text not null default 'web',
  payment_method  text,
  coupon_code     text,
  item_count      integer not null,
  total_amount    numeric(12,2) not null,
  dengage_status  text not null default 'received',
  dengage_detail  text,
  simulated       boolean not null default true,
  created_at      timestamptz not null default now()
);

comment on table public.dtelco_order is
  'Orders placed on the site, stored before Dengage is called and carrying what Dengage answered. Fed to /dataspace/ecomm/orders_detail/upsert, which is the orders family; ec:order from the browser is the order_events family, and both are sent on purpose.';
comment on column public.dtelco_order.order_status is
  'success or refund only. reference/upsertorders allows no other value, which is why shipped and delivered are custom events.';

create index if not exists dtelco_order_contact_idx on public.dtelco_order(contact_key);
create index if not exists dtelco_order_date_idx on public.dtelco_order(order_date desc);

create table if not exists public.dtelco_order_item (
  order_id           text not null references public.dtelco_order(order_id) on delete cascade,
  product_id         text not null,
  -- A product with no variants is its own only variant. Leaving this null dropped the key on every
  -- wishlist row once already, so it is not nullable here.
  product_variant_id text not null,
  quantity           integer not null check (quantity > 0),
  unit_price         numeric(12,2) not null,
  discounted_price   numeric(12,2) not null,
  primary key (order_id, product_variant_id)
);

comment on table public.dtelco_order_item is
  'The lines of an order. item_count on the parent is the sum of these quantities and total_amount is the sum of discounted_price times quantity, both of which reference/upsertorders validates.';

alter table public.dtelco_order      enable row level security;
alter table public.dtelco_order_item enable row level security;

-- One read policy each for the Dengage reader role. RLS with no policy returns zero rows and no
-- error, which looks exactly like a table nobody has bought from.
drop policy if exists dtelco_order_read on public.dtelco_order;
create policy dtelco_order_read on public.dtelco_order for select to dengage_reader using (true);
drop policy if exists dtelco_order_item_read on public.dtelco_order_item;
create policy dtelco_order_item_read on public.dtelco_order_item for select to dengage_reader using (true);
grant select on public.dtelco_order, public.dtelco_order_item to dengage_reader;

-- One flat view, so an order audience needs no join on Dengage's side.
create or replace view public.v_dtelco_orders with (security_invoker = true) as
select o.order_id, o.contact_key, o.order_date, o.order_status, o.order_source,
       o.payment_method, o.coupon_code, o.item_count, o.total_amount, o.dengage_status
from public.dtelco_order o;

grant select on public.v_dtelco_orders to dengage_reader;
