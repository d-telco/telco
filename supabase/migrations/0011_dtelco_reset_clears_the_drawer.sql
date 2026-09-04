-- The reset did not clear the demo's own message centre.
--
-- dtelco-message writes every confirmation and every transactional send into dtelco_inbox, and the
-- drawer reads it. Nothing cleared it, so the second rehearsal opened on the first rehearsal's
-- messages, which tells a room the demonstration is a recording.
--
-- Cleared in full, like the leads: the seed creates none and dtelco-message is the only writer.

create or replace function public.dtelco_reset_demo()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare p int; v int; u int; e int; t int; b int; w int; l int; m int; cut timestamptz;
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
  delete from public.dtelco_watch   where simulated; get diagnostics w = row_count;

  -- Every lead is a demonstration's own: the seed creates none, and the relay is the only writer.
  -- If a seed ever adds one, give it the same simulated marker rather than narrowing this by date,
  -- because the seeded dates roll and a date cut off would then clear the wrong side.
  delete from public.dtelco_web_lead where true; get diagnostics l = row_count;

  -- The demo's own message centre. Every row is written during a demonstration by dtelco-message,
  -- the seed creates none, and a drawer that opens on yesterday's confirmations is a drawer that
  -- tells the room the demonstration is a recording.
  delete from public.dtelco_inbox where true; get diagnostics m = row_count;

  return jsonb_build_object('opening_state_taken_at', cut,
    'products_restored', p, 'variants_restored', v, 'usage_periods_restored', u,
    'simulator_events_cleared', e, 'simulator_tickets_cleared', t,
    'simulator_invoices_cleared', b, 'session_watches_cleared', w, 'web_leads_cleared', l,
    'own_messages_cleared', m);
end $$;

revoke all on function public.dtelco_reset_demo() from public, anon, authenticated;
grant execute on function public.dtelco_reset_demo() to service_role;
