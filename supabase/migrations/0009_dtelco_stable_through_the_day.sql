-- Two views measured to the second, so their answer changed as the afternoon wore on.
--
-- After the first roll, thirteen of the fourteen segments matched handoff/SEGMENTS.md exactly and
-- dormant_30d read 216 against a documented 217. The roll was not at fault. Twelve views compare
-- against current_date, which is the same answer all day. These two compared against
-- now() - interval '30 days', which is a moving instant: a contact whose newest offline signal
-- sits near the boundary is inside the segment at nine in the morning and outside it at four in
-- the afternoon.
--
-- A segment a presenter cannot quote twice in one day is not a segment. Both now switch to
-- current_date, which makes them stable between midnights like the other twelve. The predicate
-- reads the same in words: no contact for thirty days, a roaming pack bought within thirty days.
--
-- These are written out in full because the definitions in migration 0005 are no longer what the
-- database holds: dormant_30d was rewritten in supabase/seed/0203_dtelco_segment_corrections.sql
-- after it read 721 rows on the first pass, and that rewrite added two columns. Replacing a view
-- cannot drop a column, so a shorter select cannot be written over a longer one. From
-- here the current definition of both views is this file.

create or replace view public.v_dtelco_dormant_30d with (security_invoker = true) as
select c.contact_key, c.plan_id, c.lifecycle, c.arpu, c.city, c.last_offline_at,
       c.data_used_gb, c.data_cap_gb
from public.v_dtelco_contact_360 c
where c.lifecycle <> 'new'
  and c.activation_date < current_date - 60
  and (c.lifecycle = 'dormant'
       or (c.data_cap_gb > 0 and (c.data_used_gb / c.data_cap_gb) < 0.05))
  and (c.last_offline_at is null or c.last_offline_at < current_date - 30);
comment on view public.v_dtelco_dormant_30d is
  'No usage worth the name and no contact in a month, on a line old enough for that to mean something. Measured against current_date rather than now(), so the count is the same all day.';

create or replace view public.v_dtelco_roamers_now with (security_invoker = true) as
select c.contact_key, c.plan_id, c.roaming_days, c.balance, c.city,
       exists (select 1 from public.dtelco_offline_event o
               where o.contact_key = c.contact_key
                 and o.event_type = 'roaming_pack'
                 and o.event_date >= current_date - 30) as has_pack
from public.v_dtelco_contact_360 c
where c.roaming_days > 0;
comment on view public.v_dtelco_roamers_now is
  'Abroad right now. has_pack false is the arrival journey audience: roaming detected and nothing bought. Measured against current_date, so the split is the same all day.';
