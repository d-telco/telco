-- The demonstration has a shelf life, and this is the fix.
--
-- Seven of the fourteen segment views compare a seeded date against current_date or now(). Three
-- of them had already moved one day after the counts in handoff/SEGMENTS.md were written. Four of
-- the seven decay rather than merely move, and two decay to zero: left alone, the payment recovery
-- audience and the switcher audience empty out on their own, and the journeys built on them have
-- nobody to address. A demonstration that works today and is embarrassing in November is a defect,
-- not a quirk.
--
-- The data moves rather than the clock. Freezing what the views read is less work and does not
-- hold: the pages, the profile endpoint and the panel all do
-- their own arithmetic against the real calendar, so a frozen clock would put "expires in three
-- days" on a page beside a panel that disagrees. Rolling the seeded dates forward is also what a
-- real operator's BSS looks like, which is the whole point.
--
-- Two things had to be fixed before a roll was safe, and both are here.

-- 1. The reset clears simulator rows by TIME, so a roll must not reach seeded data.
--
-- dtelco_reset_demo deleted offline events dated at or after the snapshot, on the reasoning that
-- every seeded row sits in the past. Roll the seeded rows forward and that reasoning fails: they
-- cross the line and the next reset deletes them. Tickets and invoices were already cleared by an
-- id pattern, so only offline events needed a mark of their own.
alter table public.dtelco_offline_event
  add column if not exists simulated boolean not null default false;
comment on column public.dtelco_offline_event.simulated is
  'True only for rows the operator simulator wrote. The reset clears these and nothing else. Clearing by time worked until the seeded dates started moving.';

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

  delete from public.dtelco_offline_event where simulated; get diagnostics e = row_count;
  delete from public.dtelco_ticket  where ticket_id  like 'TCK-%-SIM'; get diagnostics t = row_count;
  delete from public.dtelco_billing where invoice_id like 'INV-%-SIM'; get diagnostics b = row_count;

  return jsonb_build_object('opening_state_taken_at', cut,
    'products_restored', p, 'variants_restored', v, 'usage_periods_restored', u,
    'simulator_events_cleared', e, 'simulator_tickets_cleared', t,
    'simulator_invoices_cleared', b);
end $$;

revoke all on function public.dtelco_reset_demo() from public, anon, authenticated;
grant execute on function public.dtelco_reset_demo() to service_role;

-- 2. The date the seed represents, written down.
--
-- Without an anchor a roll has nothing to measure from, and rolling twice in one day would move
-- the data twice. One row, one date, updated by the roll and by nothing else.
create table if not exists public.dtelco_clock (
  id          int primary key default 1,
  anchor_date date not null,
  rolled_days int not null default 0,
  rolled_at   timestamptz,
  constraint dtelco_clock_single check (id = 1)
);
comment on table public.dtelco_clock is
  'The date the seeded data represents. Reference only: it describes the data set, not a person, so it is never a Dengage remote source.';
alter table public.dtelco_clock enable row level security;

insert into public.dtelco_clock (id, anchor_date) values (1, date '2026-09-03')
on conflict (id) do nothing;

-- 3. The roll itself.
--
-- Shifts every seeded date by the days between the anchor and the target, which reproduces the
-- counts in handoff/SEGMENTS.md exactly because the seed is deterministic. Three details are not
-- obvious and each one would fail silently if missed.
--
--   period_start is half the primary key of dtelco_usage, and a monthly series shifted by roughly
--   a month collides with itself mid statement. The unique index is not deferrable and making it
--   so would mean dropping a primary key, so the shift goes out to an impossible date and comes
--   back. The same applies to the snapshot's ref2.
--
--   dtelco_demo_snapshot keys its usage rows on period_start as text. Shift the table and not the
--   snapshot and the reset silently restores nothing, reporting usage_periods_restored 0, which
--   reads exactly like "nothing needed restoring".
--
--   Simulator rows are not rolled. They were written now and they mean now. Rolling them would put
--   a care call from this morning after a plan expiry that just moved six weeks into the future.
--
-- Everything moves by whole days, period_start included, so a usage series seeded on month firsts
-- sits a few days off the first after a roll. That reads correctly rather than wrongly: operators
-- bill on the activation anniversary far more often than on the first of the month.
--
-- device_age_months is deliberately left alone. It is a stored absolute, and the seeded upgrade
-- eligible count assumed it, so leaving it fixed and rolling contract_end is what restores the
-- shape rather than approximating it.
create or replace function public.dtelco_roll_dates(p_target date default current_date)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  anchor date; shift int; far int := 100000;
  n_sub int; n_use int; n_bil int; n_tic int; n_off int; n_wat int; n_snap int;
  sim int; counts jsonb;
begin
  select anchor_date into anchor from public.dtelco_clock where id = 1;
  if anchor is null then
    return jsonb_build_object('ok', false, 'why', 'no anchor row in dtelco_clock');
  end if;

  shift := p_target - anchor;
  select count(*) into sim from public.dtelco_offline_event where simulated;

  if shift = 0 then
    return jsonb_build_object('ok', true, 'shift_days', 0, 'anchor_date', anchor,
      'why', 'the seeded data already represents this date, so nothing moved',
      'simulator_rows_present', sim);
  end if;

  /* Every unqualified update below carries `where true`. Supabase preloads safeupdate for the
     role the Data API connects as, so an UPDATE with no WHERE is refused over RPC even though the
     same statement runs in the SQL editor. The roll touches every row on purpose, and saying so
     explicitly is better than discovering it in front of a room. */
  update public.dtelco_subscriber
  set activation_date = activation_date + shift,
      contract_end    = case when contract_end is null then null else contract_end + shift end
  where true;
  get diagnostics n_sub = row_count;

  -- Out to an impossible date and back, because the shift would otherwise collide with itself.
  update public.dtelco_usage set period_start = period_start + far where true;
  update public.dtelco_usage
  set period_start    = period_start - far + shift,
      plan_expires_on = case when plan_expires_on is null then null else plan_expires_on + shift end,
      last_topup_at   = case when last_topup_at is null then null
                             else last_topup_at + make_interval(days => shift) end
  where true;
  get diagnostics n_use = row_count;

  update public.dtelco_billing set issued_at = issued_at + shift, due_at = due_at + shift
  where true;
  get diagnostics n_bil = row_count;

  update public.dtelco_ticket
  set opened_at   = opened_at + make_interval(days => shift),
      resolved_at = case when resolved_at is null then null
                         else resolved_at + make_interval(days => shift) end
  where true;
  get diagnostics n_tic = row_count;

  update public.dtelco_offline_event
  set event_date = event_date + make_interval(days => shift)
  where not simulated;
  get diagnostics n_off = row_count;

  update public.dtelco_watch set created_at = created_at + make_interval(days => shift)
  where true;
  get diagnostics n_wat = row_count;

  update public.dtelco_demo_snapshot set ref2 = ((ref2::date) + far)::text where kind = 'usage';
  update public.dtelco_demo_snapshot set ref2 = ((ref2::date) - far + shift)::text where kind = 'usage';
  get diagnostics n_snap = row_count;
  update public.dtelco_demo_snapshot set taken_at = taken_at + make_interval(days => shift)
  where true;

  update public.dtelco_clock
  set anchor_date = p_target, rolled_days = rolled_days + shift, rolled_at = now()
  where id = 1;

  select jsonb_object_agg(k, n) into counts from (
    select 'heavy_on_small_plan' as k, count(*) as n from public.v_dtelco_heavy_on_small_plan
    union all select 'low_balance_high_usage', count(*) from public.v_dtelco_low_balance_high_usage
    union all select 'plan_expiring_7d', count(*) from public.v_dtelco_plan_expiring_7d
    union all select 'renewal_failed', count(*) from public.v_dtelco_renewal_failed
    union all select 'roamers_now', count(*) from public.v_dtelco_roamers_now
    union all select 'frequent_travellers', count(*) from public.v_dtelco_frequent_travellers
    union all select 'dormant_30d', count(*) from public.v_dtelco_dormant_30d
    union all select 'churn_risk', count(*) from public.v_dtelco_churn_risk
    union all select 'upgrade_eligible', count(*) from public.v_dtelco_upgrade_eligible
    union all select 'family_candidates', count(*) from public.v_dtelco_family_candidates
    union all select 'switchers_1m', count(*) from public.v_dtelco_switchers_1m
    union all select 'stock_waiters_with_stock', count(*) from public.v_dtelco_stock_waiters_with_stock
    union all select 'price_watchers', count(*) from public.v_dtelco_price_watchers
    union all select 'fiber_checked_no_order', count(*) from public.v_dtelco_fiber_checked_no_order
  ) s;

  return jsonb_build_object('ok', true, 'shift_days', shift,
    'anchor_was', anchor, 'anchor_now', p_target,
    'simulator_rows_present', sim,
    'rows', jsonb_build_object('subscriber', n_sub, 'usage', n_use, 'billing', n_bil,
                               'ticket', n_tic, 'offline_event', n_off, 'watch', n_wat,
                               'snapshot_usage_keys', n_snap),
    'segments_now', counts);
end $$;

comment on function public.dtelco_roll_dates(date) is
  'Rolls the seeded dates so the counts in handoff/SEGMENTS.md hold today. Run a reset first: simulator rows are not rolled, on purpose.';

revoke all on function public.dtelco_roll_dates(date) from public, anon, authenticated;
grant execute on function public.dtelco_roll_dates(date) to service_role;
