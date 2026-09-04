-- One flat view per segment. the panel builds a segment over a single
-- remote table at a time, so every join lives here and the panel sees flat tables.
-- security_invoker = true on every one, so a view cannot bypass the RLS on what it reads.
-- Every view carries contact_key, because a remote table has to relate to master_contact.

create or replace view public.v_dtelco_latest_usage with (security_invoker = true) as
select distinct on (u.contact_key) u.*
from public.dtelco_usage u
order by u.contact_key, u.period_start desc;

create or replace view public.v_dtelco_contact_360 with (security_invoker = true) as
select
  s.contact_key, s.msisdn, s.full_name, s.email, s.city, s.plan_id, s.plan_type,
  s.lifecycle, s.arpu, s.arpu_band, s.esim, s.family_lines, s.address_id,
  s.device_product_id, s.device_age_months, s.contract_end, s.activation_date,
  s.preferred_store, s.preferred_channel, s.is_persona,
  u.data_cap_gb, u.data_used_gb,
  case when u.data_cap_gb > 0 then round(u.data_used_gb / u.data_cap_gb, 3) end as data_ratio,
  u.minutes_used, u.sms_used, u.roaming_days, u.balance,
  u.last_topup_at, u.last_topup_amount, u.plan_expires_on,
  (select count(*) from public.dtelco_ticket t
     where t.contact_key = s.contact_key and t.status = 'open')            as open_tickets,
  (select max(t.nps) from public.dtelco_ticket t
     where t.contact_key = s.contact_key)                                  as last_nps,
  (select count(*) from public.dtelco_watch w
     where w.contact_key = s.contact_key)                                  as watched_products,
  (select count(*) from public.dtelco_web_lead l
     where l.contact_key = s.contact_key)                                  as web_leads,
  (select max(o.event_date) from public.dtelco_offline_event o
     where o.contact_key = s.contact_key)                                  as last_offline_at,
  (select count(*) > 0 from public.dtelco_web_lead l
     where l.contact_key = s.contact_key)                                  as known_both_sides
from public.dtelco_subscriber s
left join public.v_dtelco_latest_usage u on u.contact_key = s.contact_key;
comment on view public.v_dtelco_contact_360 is
  'The customer base, web behaviour and offline history merged on contact_key. known_both_sides is the claim a composable CDP has to be able to answer.';

create or replace view public.v_dtelco_heavy_on_small_plan with (security_invoker = true) as
select contact_key, plan_id, plan_type, data_cap_gb, data_used_gb, data_ratio, arpu, city
from public.v_dtelco_contact_360
where data_cap_gb is not null and data_cap_gb <= 10 and data_ratio >= 0.80;

create or replace view public.v_dtelco_low_balance_high_usage with (security_invoker = true) as
select contact_key, plan_id, balance, data_ratio, last_topup_at, last_topup_amount, city
from public.v_dtelco_contact_360
where plan_type = 'prepaid' and balance < 2.00 and data_ratio >= 0.70;

create or replace view public.v_dtelco_plan_expiring_7d with (security_invoker = true) as
select contact_key, plan_id, plan_expires_on, balance,
       (plan_expires_on - current_date) as days_left
from public.v_dtelco_contact_360
where plan_expires_on is not null
  and plan_expires_on between current_date and current_date + 7;

create or replace view public.v_dtelco_renewal_failed with (security_invoker = true) as
select b.contact_key, b.invoice_id, b.amount, b.issued_at, b.due_at,
       (current_date - b.issued_at) as days_since_failure
from public.dtelco_billing b
where b.status = 'renewal_failed'
  and b.issued_at >= current_date - 30;

create or replace view public.v_dtelco_roamers_now with (security_invoker = true) as
select c.contact_key, c.plan_id, c.roaming_days, c.balance, c.city,
       exists (select 1 from public.dtelco_offline_event o
               where o.contact_key = c.contact_key
                 and o.event_type = 'roaming_pack'
                 and o.event_date >= now() - interval '30 days') as has_pack
from public.v_dtelco_contact_360 c
where c.roaming_days > 0;
comment on view public.v_dtelco_roamers_now is
  'Abroad right now. has_pack false is the arrival journey audience: roaming detected and nothing bought.';

create or replace view public.v_dtelco_frequent_travellers with (security_invoker = true) as
select u.contact_key, sum(u.roaming_days)::int as roaming_days_6m, count(*)::int as periods
from public.dtelco_usage u
where u.period_start >= current_date - 180
group by u.contact_key
having sum(u.roaming_days) >= 10;

create or replace view public.v_dtelco_dormant_30d with (security_invoker = true) as
select c.contact_key, c.plan_id, c.lifecycle, c.arpu, c.city, c.last_offline_at
from public.v_dtelco_contact_360 c
where c.lifecycle = 'dormant'
   or (c.last_offline_at is not null and c.last_offline_at < now() - interval '30 days');

create or replace view public.v_dtelco_churn_risk with (security_invoker = true) as
select c.contact_key, c.plan_id, c.arpu, c.lifecycle, c.open_tickets, c.last_nps,
       exists (select 1 from public.dtelco_offline_event o
               where o.contact_key = c.contact_key
                 and o.event_type = 'port_out_requested') as port_out_requested
from public.v_dtelco_contact_360 c
where c.lifecycle = 'at_risk'
   or c.open_tickets > 0
   or (c.last_nps is not null and c.last_nps <= 6)
   or exists (select 1 from public.dtelco_offline_event o
              where o.contact_key = c.contact_key and o.event_type = 'port_out_requested');

create or replace view public.v_dtelco_upgrade_eligible with (security_invoker = true) as
select c.contact_key, c.device_product_id, c.device_age_months, c.contract_end, c.arpu,
       (c.contract_end - current_date) as days_to_contract_end
from public.v_dtelco_contact_360 c
where c.device_product_id is not null
  and ((c.contract_end is not null and c.contract_end <= current_date + 60)
       or c.device_age_months >= 24);

create or replace view public.v_dtelco_family_candidates with (security_invoker = true) as
select c.contact_key, c.address_id, c.family_lines, c.city, a.lines_at_address
from public.v_dtelco_contact_360 c
join (select address_id, count(*)::int as lines_at_address
      from public.dtelco_subscriber group by address_id) a on a.address_id = c.address_id
where a.lines_at_address >= 2 and c.family_lines = 1;
comment on view public.v_dtelco_family_candidates is
  'More than one line at the address, still billed as singles. The bundle saving is real money to them and retention to the operator.';

create or replace view public.v_dtelco_switchers_1m with (security_invoker = true) as
select c.contact_key, c.plan_id, c.activation_date, c.esim, c.city,
       exists (select 1 from public.dtelco_offline_event o
               where o.contact_key = c.contact_key and o.event_type = 'port_in_done') as ported_in
from public.v_dtelco_contact_360 c
where c.activation_date >= current_date - 30;

create or replace view public.v_dtelco_stock_waiters_with_stock with (security_invoker = true) as
select w.contact_key, w.product_id, p.title as product_title, p.price, p.stock_count, w.created_at
from public.dtelco_watch w
join public.dtelco_product p on p.product_id = w.product_id
where w.list_name = 'back_in_stock_alert'
  and p.stock_count is not null and p.stock_count > 0;
comment on view public.v_dtelco_stock_waiters_with_stock is
  'The reshape the remote source model describes: not a stock table, which relates to no contact and would never be offered, but one row per person whose wait is over.';

create or replace view public.v_dtelco_price_watchers with (security_invoker = true) as
select w.contact_key, w.product_id, p.title as product_title,
       p.price, p.discounted_price, (p.price - p.discounted_price) as saving
from public.dtelco_watch w
join public.dtelco_product p on p.product_id = w.product_id
where w.list_name = 'price_drop_alert' and p.discounted_price < p.price;

create or replace view public.v_dtelco_fiber_checked_no_order with (security_invoker = true) as
select o.contact_key, max(o.event_date) as checked_at, max(o.note) as postcode
from public.dtelco_offline_event o
where o.event_type = 'fiber_checked'
  and not exists (select 1 from public.dtelco_offline_event x
                  where x.contact_key = o.contact_key
                    and x.event_type = 'order'
                    and x.event_date > o.event_date)
group by o.contact_key;

do $$
declare v text;
begin
  foreach v in array array[
    'v_dtelco_latest_usage','v_dtelco_contact_360','v_dtelco_heavy_on_small_plan',
    'v_dtelco_low_balance_high_usage','v_dtelco_plan_expiring_7d','v_dtelco_renewal_failed',
    'v_dtelco_roamers_now','v_dtelco_frequent_travellers','v_dtelco_dormant_30d',
    'v_dtelco_churn_risk','v_dtelco_upgrade_eligible','v_dtelco_family_candidates',
    'v_dtelco_switchers_1m','v_dtelco_stock_waiters_with_stock','v_dtelco_price_watchers',
    'v_dtelco_fiber_checked_no_order'
  ] loop
    execute format('grant select on public.%I to dengage_reader', v);
  end loop;
end $$;
