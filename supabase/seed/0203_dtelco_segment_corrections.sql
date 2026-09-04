-- Correcting three segments that came out useless, and one view whose logic was simply wrong.
--
-- Nothing outside dtelco_ is touched. These UPDATEs correct rows this same session created
-- minutes earlier; rule 3 protects what already existed in the shared project, and none of the
-- ni_, rh_, hy_, dps_ or dengage_ objects are read or written here.
--
-- Why the shapes are what they are. A segment is only worth opening during a demonstration
-- if its size is defensible out loud. "Family bundle candidates: one thousand four hundred and
-- eighty six of two thousand" is not a segment, it is an accident, and the first question from
-- the room would be why three quarters of the base is a family.

-- 1. Addresses. Two thousand lines over fifteen hundred possible addresses meant almost every
--    address had a second person at it. Real households are the exception: about one line in
--    ten shares an address, so ninety percent now get an address of their own and the rest are
--    drawn from a small pool of genuine multi-line homes.
update public.dtelco_subscriber s
set address_id = case
      when (abs(hashtext(s.contact_key || 'household')) % 100) < 10
      then 'ADDR-H' || lpad(((abs(hashtext(s.contact_key || 'hh2')) % 105) + 1)::text, 4, '0')
      else 'ADDR-U' || substring(s.contact_key from 13)
    end
where not s.is_persona;

-- 2. Device age. The old distribution ran six to forty five months uniformly, so more than half
--    the base was carrying a handset over two years old and everyone was upgrade eligible.
--    Most people are on a phone under two years old; a minority are overdue, and those are the
--    audience worth talking to.
update public.dtelco_subscriber s
set device_age_months = case
      when (abs(hashtext(s.contact_key || 'devage')) % 100) < 10
      then 24 + (abs(hashtext(s.contact_key || 'devage2')) % 14)
      else 3 + (abs(hashtext(s.contact_key || 'devage2')) % 20)
    end
where not s.is_persona and s.device_product_id is not null;

-- 3. Contract end. The same problem on the postpaid side: a range of minus two hundred to plus
--    six hundred days put a third of every contract inside the next sixty days.
update public.dtelco_subscriber s
set contract_end = current_date + ((abs(hashtext(s.contact_key || 'contract')) % 730) - 30)
where not s.is_persona and s.plan_type = 'postpaid';

-- 4. The dormant view was wrong, not just badly sized. It read "lifecycle is dormant OR the last
--    offline signal is older than thirty days", and since offline signals are spread over four
--    months, almost everyone who had ever been in a store qualified. Having visited a store two
--    months ago is not dormancy. Dormancy is no usage and no contact, and a line activated last
--    week is new rather than dormant.
create or replace view public.v_dtelco_dormant_30d with (security_invoker = true) as
select c.contact_key, c.plan_id, c.lifecycle, c.arpu, c.city, c.last_offline_at,
       c.data_used_gb, c.data_cap_gb
from public.v_dtelco_contact_360 c
where c.lifecycle <> 'new'
  and c.activation_date < current_date - 60
  and (c.lifecycle = 'dormant'
       or (c.data_cap_gb > 0 and c.data_used_gb / c.data_cap_gb < 0.05))
  and (c.last_offline_at is null or c.last_offline_at < now() - interval '30 days');
comment on view public.v_dtelco_dormant_30d is
  'No usage worth the name and no contact in a month, on a line old enough for that to mean something. Not simply anyone whose last store visit was a while ago.';

-- 5. Churn risk was a broad pool: at risk, or any open ticket, or any detractor score, or a
--    port-out. An open ticket alone is a support queue, not a churn signal. Narrow it to the
--    signals that actually predict leaving, and keep the reason on the row so a journey can
--    branch on which one fired.
create or replace view public.v_dtelco_churn_risk with (security_invoker = true) as
select c.contact_key, c.plan_id, c.arpu, c.lifecycle, c.open_tickets, c.last_nps,
       exists (select 1 from public.dtelco_offline_event o
               where o.contact_key = c.contact_key
                 and o.event_type = 'port_out_requested')                 as port_out_requested,
       case when exists (select 1 from public.dtelco_offline_event o
                         where o.contact_key = c.contact_key
                           and o.event_type = 'port_out_requested')       then 'port_out'
            when c.last_nps is not null and c.last_nps <= 6               then 'detractor'
            when c.lifecycle = 'at_risk' and c.open_tickets > 0           then 'at_risk_with_case'
            else 'at_risk' end                                            as reason
from public.v_dtelco_contact_360 c
where exists (select 1 from public.dtelco_offline_event o
              where o.contact_key = c.contact_key and o.event_type = 'port_out_requested')
   or (c.last_nps is not null and c.last_nps <= 6)
   or (c.lifecycle = 'at_risk' and (c.open_tickets > 0 or c.arpu >= 20));
comment on view public.v_dtelco_churn_risk is
  'Signals that predict leaving, each named in reason so a save journey can branch on which one fired. An open ticket on its own is a support queue, not a churn signal.';

-- 6. The address correction above excluded personas but not the two household members at
--    Kamran's address, who are deliberately not personas because nobody browses as them. Their
--    addresses were rewritten and the family bundle story lost the household it exists to
--    demonstrate. Restore them explicitly. Any future pass over addresses must exclude
--    ADDR-P%, which is what an engineered address looks like.
update public.dtelco_subscriber
set address_id = 'ADDR-P007'
where contact_key in ('DPS-DTELCO-7B', 'DPS-DTELCO-7C');
