-- The eight personas, engineered rather than generated.
--
-- Each one exists to land in exactly one segment, so a presenter can open that segment in the
-- panel and find the person they are browsing as. the presenter personas
-- are engineered rows that match the simulator line for line, and that is what lets a story be
-- told twice the same way.
--
-- Email addresses are deliberately null until supplied at setup: a rehearsal must
-- never invent an address, because a bounce lands on a shared sending reputation.
-- Mobiles are the invented 555 block, sensible to read aloud and impossible to reach.

insert into public.dtelco_subscriber
  (contact_key, msisdn, full_name, email, city, plan_id, plan_type, activation_date,
   contract_end, device_product_id, device_age_months, arpu, arpu_band, lifecycle, esim,
   family_lines, address_id, preferred_store, preferred_channel, is_persona)
values
  ('DPS-DTELCO-1','+994 55 555 0001','Aysel Mammadova',null,'Baku','plan-go-11-99','prepaid',
   current_date - 420, null, 'dev-iphone-16', 14, 12.40,'mid','active', false, 1,
   'ADDR-P001','st-baku-28may','push', true),
  ('DPS-DTELCO-2','+994 55 555 0002','Rashad Quliyev', null,'Baku','plan-klass-19-postpaid','postpaid',
   current_date - 690, current_date + 45, 'dev-iphone-15', 26, 21.80,'mid','active', false, 1,
   'ADDR-P002','st-baku-nizami','email', true),
  ('DPS-DTELCO-3','+994 55 555 0003','Nigar Aliyeva',  null,'Baku','plan-go-29-99','prepaid',
   current_date - 900, null, 'dev-galaxy-s25', 11, 31.20,'high','active', true, 1,
   'ADDR-P003','st-baku-airport','whatsapp', true),
  ('DPS-DTELCO-4','+994 55 555 0004','Elvin Safarov',  null,'Ganja','plan-go-7-99','prepaid',
   current_date - 300, null, 'dev-redmi-note-14', 19, 6.90,'low','at_risk', false, 1,
   'ADDR-P004','st-ganja-central','sms', true),
  ('DPS-DTELCO-5','+994 55 555 0005','Leyla Huseynova',null,'Sumqayit','plan-klass-31-postpaid','postpaid',
   current_date - 1100, current_date + 210, 'dev-galaxy-a56', 22, 33.50,'high','at_risk', false, 1,
   'ADDR-P005','st-sumqayit','sms', true),
  ('DPS-DTELCO-6','+994 55 555 0006','Tural Bayramov', null,'Baku','plan-go-17-99','prepaid',
   current_date - 5, null, null, null, 17.99,'mid','new', true, 1,
   'ADDR-P006','st-baku-ganjlik','app', true),
  ('DPS-DTELCO-7','+994 55 555 0007','Kamran Valiyev', null,'Baku','plan-klass-19-postpaid','postpaid',
   current_date - 800, current_date + 400, 'dev-pixel-10', 9, 19.60,'mid','active', false, 1,
   'ADDR-P007','st-baku-28may','email', true),
  -- Two more lines at Kamran's address. Not personas a presenter browses as, but without them
  -- the family bundle segment has nothing to find, and a bundle story with one line is a claim.
  ('DPS-DTELCO-7B','+994 55 555 0072','Sabina Valiyeva',null,'Baku','plan-go-11-99','prepaid',
   current_date - 640, null, 'dev-galaxy-a36', 15, 11.99,'mid','active', false, 1,
   'ADDR-P007','st-baku-28may','sms', false),
  ('DPS-DTELCO-7C','+994 55 555 0073','Orkhan Valiyev', null,'Baku','plan-star-5gb','prepaid',
   current_date - 210, null, 'dev-redmi-14c', 7, 8.99,'mid','active', false, 1,
   'ADDR-P007','st-baku-28may','push', false),
  ('DPS-DTELCO-8','+994 55 555 0008','Sevinc Rahimova',null,'Lankaran','plan-go-3-99','prepaid',
   current_date - 500, null, 'dev-honor-x9c', 31, 3.99,'low','dormant', false, 1,
   'ADDR-P008','st-lankaran','email', true)
on conflict (contact_key) do nothing;

-- Usage, shaped so each persona lands in the segment their story names.
insert into public.dtelco_usage
  (contact_key, period_start, data_cap_gb, data_used_gb, minutes_cap, minutes_used, sms_cap,
   sms_used, roaming_days, balance, last_topup_at, last_topup_amount, plan_expires_on)
select v.contact_key,
       (date_trunc('month', current_date) - (k || ' months')::interval)::date,
       v.cap, least(v.cap, round((v.cap * v.ratio)::numeric, 2)), v.mins,
       round(v.mins * 0.6)::int, v.sms_cap, round(v.sms_cap * 0.5)::int,
       case when k < v.roam_months then v.roam_days else 0 end,
       v.balance,
       now() - ((12 + k * 30) || ' hours')::interval, v.topup,
       case when k = 0 then current_date + v.expires_in end
from (values
  -- Aysel is at 92 percent of a 5 GB plan, every single period. That is the usage upsell.
  ('DPS-DTELCO-1',  5.0, 0.92, 300, 150, 0, 0, 18.40,  10, 21),
  ('DPS-DTELCO-2', 18.0, 0.55, 900, 450, 0, 0,  0.00,  10, 24),
  -- Nigar roams in five of the last six months and has never bought a pack.
  ('DPS-DTELCO-3', 25.0, 0.61,1500, 500, 5, 6, 24.10,  20, 26),
  -- Elvin is under a dollar and past seventy percent of his data, with the plan about to lapse.
  ('DPS-DTELCO-4',  3.0, 0.88, 200, 100, 0, 0,  0.62,   5,  3),
  ('DPS-DTELCO-5', 35.0, 0.44,1800, 700, 0, 0,  0.00,  10, 19),
  ('DPS-DTELCO-6', 10.0, 0.12, 600, 300, 0, 0, 14.00,  20, 27),
  ('DPS-DTELCO-7', 18.0, 0.50, 900, 450, 0, 0,  0.00,  10, 25),
  ('DPS-DTELCO-7B', 5.0, 0.40, 300, 150, 0, 0,  9.20,  10, 16),
  ('DPS-DTELCO-7C', 5.0, 0.35, 250, 125, 0, 0,  7.10,  10, 12),
  -- Sevinc has used almost nothing for forty days.
  ('DPS-DTELCO-8',  1.5, 0.04, 100,  50, 0, 0,  1.10,   1, 29)
) as v(contact_key, cap, ratio, mins, sms_cap, roam_months, roam_days, balance, topup, expires_in)
cross join generate_series(0, 5) k
on conflict (contact_key, period_start) do nothing;

-- Rashad's contract is ending and the handset he wants is out of stock. He appears in the
-- stock waiter segment the moment the simulator restocks it, which is the whole point of it.
insert into public.dtelco_watch (contact_key, product_id, list_name) values
  ('DPS-DTELCO-2','dev-iphone-17-pro-max','back_in_stock_alert'),
  ('DPS-DTELCO-2','dev-iphone-17-pro','price_drop_alert'),
  ('DPS-DTELCO-1','plan-go-29-99','favorites'),
  ('DPS-DTELCO-3','roam-tr-cis-3gb','favorites'),
  ('DPS-DTELCO-8','pack-free-ai','favorites')
on conflict do nothing;

insert into public.dtelco_billing (invoice_id, contact_key, issued_at, due_at, amount, status) values
  ('INV-DPS-DTELCO-2-CUR','DPS-DTELCO-2', current_date - 6,  current_date + 8,  21.80,'due'),
  ('INV-DPS-DTELCO-5-CUR','DPS-DTELCO-5', current_date - 9,  current_date + 5,  33.50,'renewal_failed'),
  ('INV-DPS-DTELCO-7-CUR','DPS-DTELCO-7', current_date - 4,  current_date + 10, 19.60,'issued')
on conflict (invoice_id) do nothing;

insert into public.dtelco_ticket (ticket_id, contact_key, opened_at, resolved_at, channel, topic,
                                  status, nps) values
  ('TCK-DPS-DTELCO-5','DPS-DTELCO-5', now() - interval '3 days', now() - interval '2 days',
   'call','coverage','resolved', 3),
  ('TCK-DPS-DTELCO-2','DPS-DTELCO-2', now() - interval '20 days', now() - interval '19 days',
   'chat','device','resolved', 9)
on conflict (ticket_id) do nothing;

-- The offline half of each story: the port-out, the roaming detections, the fiber check.
insert into public.dtelco_offline_event (contact_key, event_type, product_id, store_id, source,
                                         note, event_date) values
  ('DPS-DTELCO-5','port_out_requested', null, null, 'care',
   'stated reason: coverage at home', now() - interval '1 day'),
  ('DPS-DTELCO-5','complaint_resolved', null, null, 'care', 'nps 3', now() - interval '2 days'),
  ('DPS-DTELCO-3','roaming_detected', null, null, 'bss', 'Turkiye', now() - interval '4 days'),
  ('DPS-DTELCO-3','roaming_detected', null, null, 'bss', 'Turkiye', now() - interval '70 days'),
  ('DPS-DTELCO-3','roaming_detected', null, null, 'bss', 'Georgia', now() - interval '140 days'),
  ('DPS-DTELCO-2','upgrade_eligible','dev-iphone-15','st-baku-nizami','bss',
   'contract ends in 45 days', now() - interval '2 days'),
  ('DPS-DTELCO-6','port_in_done', null, null, 'bss', 'moved from another operator',
   now() - interval '5 days'),
  ('DPS-DTELCO-6','number_activated', null, null, 'bss', 'eSIM', now() - interval '5 days'),
  ('DPS-DTELCO-7','fiber_checked', null, null, 'chatbot', 'AZ1073', now() - interval '9 days'),
  ('DPS-DTELCO-8','store_visit', 'pack-free-ai','st-lankaran','store',
   'asked about the AI internet campaign', now() - interval '41 days'),
  ('DPS-DTELCO-1','store_visit', 'plan-go-29-99','st-baku-28may','store',
   'asked what the next tier up costs', now() - interval '11 days')
on conflict do nothing;
