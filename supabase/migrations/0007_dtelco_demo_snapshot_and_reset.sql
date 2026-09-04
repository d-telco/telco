-- Reset, so a presenter can put the demonstration back to its opening state.
--
-- Without this the second rehearsal shows a handset already in stock and the segment that was
-- supposed to move from zero to one starts at one. The snapshot is taken ONCE from the seeded
-- rows, so a reset restores the exact opening state rather than an approximation.
--
-- Take the snapshot immediately after seeding and before pressing anything. Taking it late
-- records the mutated state as the opening state, which happened once during this build and was
-- corrected by restoring the two affected products from the committed CSV first.

create table if not exists public.dtelco_demo_snapshot (
  kind text not null, ref text not null, ref2 text not null default '',
  numeric_1 numeric, numeric_2 numeric, numeric_3 numeric,
  taken_at timestamptz not null default now(),
  primary key (kind, ref, ref2)
);
comment on table public.dtelco_demo_snapshot is
  'The opening state of everything the operator simulator can change. Never a Dengage remote source: it describes products and periods, not people.';
alter table public.dtelco_demo_snapshot enable row level security;

insert into public.dtelco_demo_snapshot (kind, ref, numeric_1, numeric_2)
select 'product', product_id, stock_count, discounted_price from public.dtelco_product
on conflict (kind, ref, ref2) do nothing;

insert into public.dtelco_demo_snapshot (kind, ref, numeric_1, numeric_2)
select 'variant', product_variant_id, stock_count, discounted_price
from public.dtelco_product_variant
on conflict (kind, ref, ref2) do nothing;

insert into public.dtelco_demo_snapshot (kind, ref, ref2, numeric_1, numeric_2, numeric_3)
select 'usage', u.contact_key, u.period_start::text, u.data_used_gb, u.balance, u.roaming_days
from public.dtelco_usage u
join public.dtelco_subscriber s on s.contact_key = u.contact_key
where s.is_persona or s.contact_key like 'DPS-DTELCO-7%'
on conflict (kind, ref, ref2) do nothing;

/* Rows the simulator created are cleared by TIME, not by a label.
   The first version cleared offline events where source = 'simulator', which missed almost
   everything: the operator writes the real source the signal came from, bss or care or store,
   and that is correct, because the whole point is that a care call looks like a care call on
   the profile. Every seeded row is deliberately dated in the past, so anything at or after the
   snapshot was written by a press of a button. */
create or replace function public.dtelco_reset_demo()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare p int; v int; u int; e int; t int; b int; cut timestamptz;
begin
  select min(taken_at) into cut from public.dtelco_demo_snapshot;

  update public.dtelco_product t set stock_count = s.numeric_1::int, discounted_price = s.numeric_2
  from public.dtelco_demo_snapshot s
  where s.kind = 'product' and s.ref = t.product_id
    and (t.stock_count is distinct from s.numeric_1::int
         or t.discounted_price is distinct from s.numeric_2);
  get diagnostics p = row_count;

  update public.dtelco_product_variant t
  set stock_count = s.numeric_1::int, discounted_price = s.numeric_2
  from public.dtelco_demo_snapshot s
  where s.kind = 'variant' and s.ref = t.product_variant_id
    and (t.stock_count is distinct from s.numeric_1::int
         or t.discounted_price is distinct from s.numeric_2);
  get diagnostics v = row_count;

  update public.dtelco_usage t
  set data_used_gb = s.numeric_1, balance = s.numeric_2, roaming_days = s.numeric_3::int,
      updated_at = now()
  from public.dtelco_demo_snapshot s
  where s.kind = 'usage' and s.ref = t.contact_key and s.ref2 = t.period_start::text
    and (t.data_used_gb is distinct from s.numeric_1
         or t.balance is distinct from s.numeric_2
         or t.roaming_days is distinct from s.numeric_3::int);
  get diagnostics u = row_count;

  delete from public.dtelco_offline_event where event_date >= cut; get diagnostics e = row_count;
  delete from public.dtelco_ticket  where ticket_id  like 'TCK-%-SIM'; get diagnostics t = row_count;
  delete from public.dtelco_billing where invoice_id like 'INV-%-SIM'; get diagnostics b = row_count;

  return jsonb_build_object('opening_state_taken_at', cut,
    'products_restored', p, 'variants_restored', v, 'usage_periods_restored', u,
    'simulator_events_cleared', e, 'simulator_tickets_cleared', t,
    'simulator_invoices_cleared', b);
end $$;

revoke all on function public.dtelco_reset_demo() from public, anon, authenticated;
grant execute on function public.dtelco_reset_demo() to service_role;
