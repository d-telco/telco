-- Usage, billing, care and offline history.
--
-- Usage is the one signal only a telecom operator has, and it is what makes the segments in
-- this demonstration different from any ecommerce demo: nobody else can say "this person is at
-- ninety two percent of their allowance, on a plan that is too small for them, on the twenty
-- second of the month".
--
-- Six monthly periods per subscriber, so the frequent traveller view has six months to sum and
-- the latest period is what every other view reads. Deterministic from hashtext of the key and
-- the period, so the counts a presenter quotes are exact.

insert into public.dtelco_usage
  (contact_key, period_start, data_cap_gb, data_used_gb, minutes_cap, minutes_used,
   sms_cap, sms_used, roaming_days, balance, last_topup_at, last_topup_amount, plan_expires_on)
select
  s.contact_key,
  (date_trunc('month', current_date) - (k || ' months')::interval)::date as period_start,
  coalesce(p.data_gb, 50)                                               as data_cap_gb,
  round((coalesce(p.data_gb, 50) * least(1.0,
      0.18 + ((abs(hashtext(s.contact_key || 'use' || k::text)) % 95) / 100.0)))::numeric, 2),
  p.minutes,
  round(coalesce(p.minutes, 300) *
      ((abs(hashtext(s.contact_key || 'min' || k::text)) % 90) / 100.0))::int,
  p.sms,
  round(coalesce(p.sms, 150) *
      ((abs(hashtext(s.contact_key || 'sms' || k::text)) % 85) / 100.0))::int,
  -- Most people never leave the country in a given month. The ones who do, do it repeatedly,
  -- which is what makes a frequent traveller segment worth having.
  case when (abs(hashtext(s.contact_key || 'roam')) % 100) < 12
       then (abs(hashtext(s.contact_key || 'rd' || k::text)) % 9)
       else 0 end,
  case when s.plan_type = 'prepaid'
       then round(((abs(hashtext(s.contact_key || 'bal' || k::text)) % 3500) / 100.0)::numeric, 2)
       else 0 end,
  case when s.plan_type = 'prepaid'
       then now() - ((abs(hashtext(s.contact_key || 'tu' || k::text)) % 700) || ' hours')::interval
       end,
  case when s.plan_type = 'prepaid'
       then (array[1,5,10,20,50])[1 + (abs(hashtext(s.contact_key || 'ta' || k::text)) % 5)]
       end,
  case when k = 0
       then current_date + ((abs(hashtext(s.contact_key || 'exp')) % 34) - 2)
       end
from public.dtelco_subscriber s
join public.dtelco_product p on p.product_id = s.plan_id
cross join generate_series(0, 5) k
where not s.is_persona
on conflict (contact_key, period_start) do nothing;

-- Postpaid billing. One invoice a month, and a small share that failed to renew, which is the
-- payment recovery audience.
insert into public.dtelco_billing (invoice_id, contact_key, issued_at, due_at, amount, status)
select
  'INV-' || s.contact_key || '-' || to_char(date_trunc('month', current_date)
      - (k || ' months')::interval, 'YYYYMM'),
  s.contact_key,
  (date_trunc('month', current_date) - (k || ' months')::interval)::date,
  (date_trunc('month', current_date) - (k || ' months')::interval)::date + 14,
  round((s.arpu * (0.92 + (abs(hashtext(s.contact_key || 'inv' || k::text)) % 25) / 100.0))::numeric, 2),
  case
    when k = 0 and (abs(hashtext(s.contact_key || 'st')) % 100) < 7  then 'renewal_failed'
    when k = 0 and (abs(hashtext(s.contact_key || 'st')) % 100) < 14 then 'overdue'
    when k = 0 and (abs(hashtext(s.contact_key || 'st')) % 100) < 40 then 'due'
    when k = 0 then 'issued'
    else 'paid'
  end
from public.dtelco_subscriber s
cross join generate_series(0, 3) k
where s.plan_type = 'postpaid' and not s.is_persona
on conflict (invoice_id) do nothing;

-- Care. Roughly one line in eight has been in touch, and the resolved ones carry an NPS score,
-- because a detractor is a segment and a promoter is a different one.
insert into public.dtelco_ticket (ticket_id, contact_key, opened_at, resolved_at, channel,
                                  topic, status, nps)
select
  'TCK-' || s.contact_key,
  s.contact_key,
  now() - ((abs(hashtext(s.contact_key || 'topen')) % 90) || ' days')::interval,
  case when (abs(hashtext(s.contact_key || 'tres')) % 100) < 72
       then now() - ((abs(hashtext(s.contact_key || 'tres2')) % 40) || ' days')::interval end,
  (array['call','chat','store','whatsapp'])[1 + (abs(hashtext(s.contact_key || 'tch')) % 4)],
  (array['coverage','billing','data','roaming','device','esim'])[
      1 + (abs(hashtext(s.contact_key || 'ttop')) % 6)],
  case when (abs(hashtext(s.contact_key || 'tres')) % 100) < 72 then 'resolved'
       when (abs(hashtext(s.contact_key || 'tres')) % 100) < 90 then 'open'
       else 'escalated' end,
  case when (abs(hashtext(s.contact_key || 'tres')) % 100) < 72
       then (abs(hashtext(s.contact_key || 'nps')) % 11) end
from public.dtelco_subscriber s
where not s.is_persona and (abs(hashtext(s.contact_key || 'has_ticket')) % 100) < 13
on conflict (ticket_id) do nothing;

-- Offline and back office signals. The same event_type vocabulary the browser writes into the
-- Dengage custom table, so one profile carries both sides without anybody reconciling them.
insert into public.dtelco_offline_event (contact_key, event_type, product_id, store_id, source,
                                         note, event_date)
select s.contact_key,
       (array['store_visit','care_call','chatbot_intent','roaming_detected','fiber_checked',
              'port_in_done','upgrade_eligible','bill_paid'])[
           1 + (abs(hashtext(s.contact_key || 'ev' || k::text)) % 8)],
       case when (abs(hashtext(s.contact_key || 'evp' || k::text)) % 3) = 0
            then s.device_product_id end,
       s.preferred_store,
       (array['bss','care','store','chatbot'])[
           1 + (abs(hashtext(s.contact_key || 'evs' || k::text)) % 4)],
       'AZ' || lpad((1000 + (abs(hashtext(s.contact_key || 'pc')) % 900))::text, 4, '0'),
       now() - ((abs(hashtext(s.contact_key || 'evd' || k::text)) % 120) || ' days')::interval
from public.dtelco_subscriber s
cross join generate_series(1, 2) k
where not s.is_persona and (abs(hashtext(s.contact_key || 'has_offline')) % 100) < 42;
