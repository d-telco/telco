-- The three products the site last chose for a contact, held in Postgres so they can be synced
-- into a Dengage send list table.
--
-- Why this exists at all. The relay already writes the three ids to the Dengage CONTACT, which a
-- marketing message reads with $from and $Contact. That route is documented and it works, and it
-- has one limit that is also documented: reference/advanced-personalization says $Contact "can be
-- null in Push sends". So a push cannot resolve the recommendation from the contact.
--
-- The documented way round it is a send list. The same page says $Current "contains extra columns
-- coming from a selected audience. This can be from a Send List Table or a SQL Segment", and its
-- own worked Example 1 is titled "Product Recommendations from a Send List". A campaign whose
-- audience is such a table gets $Current.reco_product_id_1 in every channel, push included, with
-- no lookup and no caveat.
--
-- Dengage's copy of that table is written through /dataspace/sync/upsert, which needs the rows to
-- exist somewhere first. This is that somewhere.
create table if not exists public.dtelco_reco (
  contact_key       text primary key,
  reco_product_id_1 text,
  reco_product_id_2 text,
  reco_product_id_3 text,
  reco_rule         text,
  reco_at           timestamptz not null default now(),
  -- Set when the row was last accepted by /dataspace/sync/upsert, so the console can say which
  -- rows Dengage holds rather than which rows exist here. Accepted is not stored: storage lags
  -- about two minutes, and a count is what proves it.
  synced_at         timestamptz,
  sync_detail       text,
  -- The mark the reset clears by, exactly as dtelco_watch and dtelco_offline_event use.
  simulated         boolean not null default true,
  updated_at        timestamptz not null default now()
);

comment on table public.dtelco_reco is
  'The three product ids the site last recommended to a contact. Synced into a Dengage send list table so a campaign on any channel, push included, can read them as $Current. The contact route through $Contact and $from stays as it is; this is the second route, for the one channel the first cannot reach.';
comment on column public.dtelco_reco.synced_at is
  'When /dataspace/sync/upsert last accepted this row. Accepted is not stored.';

create index if not exists dtelco_reco_updated_idx on public.dtelco_reco(updated_at desc);

alter table public.dtelco_reco enable row level security;

-- One read policy for the Dengage reader role, because RLS with no policy returns zero rows with
-- no error, which is the failure mode that looks exactly like an empty segment.
drop policy if exists dtelco_reco_read on public.dtelco_reco;
create policy dtelco_reco_read on public.dtelco_reco for select to dengage_reader using (true);
grant select on public.dtelco_reco to dengage_reader;

-- A flat view per audience, as every other remote source here is shaped. One row per contact, the
-- three ids beside it, and nothing that needs a join on Dengage's side.
create or replace view public.v_dtelco_reco_ready with (security_invoker = true) as
select r.contact_key,
       r.reco_product_id_1,
       r.reco_product_id_2,
       r.reco_product_id_3,
       r.reco_rule,
       r.reco_at
from public.dtelco_reco r
where r.reco_product_id_1 is not null;

comment on view public.v_dtelco_reco_ready is
  'Contacts with at least one stored recommendation. The audience a campaign selects so every channel, push included, reads the three ids as $Current.';

grant select on public.v_dtelco_reco_ready to dengage_reader;
