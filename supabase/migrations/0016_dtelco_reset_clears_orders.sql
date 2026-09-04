-- The reset clears the orders a demonstration placed.
--
-- Found by running the reset and counting: three orders survived it. The seed places none, so
-- every row in dtelco_order was placed during a demonstration, and a shop that opens showing
-- yesterday's purchases in "your orders" tells the room it is a recording.
--
-- The items go first. dtelco_order_item carries a foreign key with on delete cascade, so the
-- parent delete would take them anyway, but doing it explicitly means the count is reportable
-- rather than invisible.
create or replace function public.dtelco_reset_demo()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare p int; v int; u int; e int; t int; b int; w int; l int; m int; r int; a int; o int;
        cut timestamptz;
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
  delete from public.dtelco_web_lead where true; get diagnostics l = row_count;
  delete from public.dtelco_inbox where true; get diagnostics m = row_count;
  delete from public.dtelco_reco where simulated; get diagnostics r = row_count;

  delete from public.dtelco_order_item i
  using public.dtelco_order o2 where o2.order_id = i.order_id and o2.simulated;
  delete from public.dtelco_order where simulated; get diagnostics o = row_count;

  -- Adopted lines, and their usage rows first: dtelco_usage carries a foreign key to the
  -- subscriber and no cascade, so deleting the parent while a child exists fails outright.
  delete from public.dtelco_usage u2
  using public.dtelco_subscriber s2
  where s2.contact_key = u2.contact_key and s2.simulated;
  delete from public.dtelco_subscriber where simulated; get diagnostics a = row_count;

  return jsonb_build_object('opening_state_taken_at', cut,
    'products_restored', p, 'variants_restored', v, 'usage_periods_restored', u,
    'simulator_events_cleared', e, 'simulator_tickets_cleared', t,
    'simulator_invoices_cleared', b, 'session_watches_cleared', w, 'web_leads_cleared', l,
    'own_messages_cleared', m, 'recommendations_cleared', r, 'adopted_lines_cleared', a,
    'orders_cleared', o);
end $$;

revoke all on function public.dtelco_reset_demo() from public, anon, authenticated;
grant execute on function public.dtelco_reset_demo() to service_role;
