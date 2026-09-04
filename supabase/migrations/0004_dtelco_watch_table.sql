-- Wishlist intent has to exist in Postgres as well as in Dengage.
--
-- Dengage holds the authoritative wishlist_events rows and segments over them directly. But a
-- remote view cannot see inside Dengage, so the stock waiter segment and the per contact
-- fallback for the price drop and back in stock journeys (brief A8 note on journeys 5 and 6)
-- need the same intent on this side. The relay writes here at the same moment the page writes
-- the wishlist event, so the two agree.

create table if not exists public.dtelco_watch (
  contact_key text not null,
  product_id  text not null,
  list_name   text not null,
  created_at  timestamptz not null default now(),
  primary key (contact_key, product_id, list_name),
  constraint dtelco_watch_key_shape check (contact_key ~ '^DPS-[A-Za-z0-9_-]{1,44}$'),
  constraint dtelco_watch_list check (list_name in
    ('favorites','shopping_list','price_drop_alert','back_in_stock_alert'))
);
comment on table public.dtelco_watch is
  'Mirror of the four Dengage wishlist lists, written by the relay so a remote view can reach the same intent. The four list names are exactly the Dengage vocabulary; a fifth would be unsegmentable on the Dengage side.';
create index if not exists dtelco_watch_product_idx on public.dtelco_watch(product_id, list_name);

alter table public.dtelco_watch enable row level security;
grant select on public.dtelco_watch to dengage_reader;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='dtelco_watch' and policyname='dengage_remote_read') then
    create policy dengage_remote_read on public.dtelco_watch for select to dengage_reader using (true);
  end if;
end $$;
