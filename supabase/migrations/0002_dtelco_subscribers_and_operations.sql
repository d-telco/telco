-- Subscribers and operations. Every table here carries contact_key, so every one of them can
-- relate to master_contact and become a Dengage remote source. That is the whole difference
-- between this file and 0001.

create table if not exists public.dtelco_subscriber (
  contact_key       text primary key,
  msisdn            text not null,
  full_name         text not null,
  email             text,
  city              text not null,
  plan_id           text not null,
  plan_type         text not null,
  activation_date   date not null,
  contract_end      date,
  device_product_id text,
  device_age_months integer,
  arpu              numeric(10,2) not null,
  arpu_band         text not null,
  lifecycle         text not null,
  esim              boolean not null default false,
  family_lines      integer not null default 1,
  address_id        text not null,
  preferred_store   text,
  preferred_channel text not null default 'email',
  is_persona        boolean not null default false,
  created_at        timestamptz not null default now(),
  constraint dtelco_sub_key_shape check (contact_key ~ '^DPS-[A-Za-z0-9_-]{1,44}$'),
  constraint dtelco_sub_plan_type check (plan_type in ('prepaid','postpaid')),
  constraint dtelco_sub_lifecycle check (lifecycle in ('new','active','dormant','at_risk','churned')),
  constraint dtelco_sub_arpu_band check (arpu_band in ('low','mid','high')),
  constraint dtelco_sub_channel check (preferred_channel in ('email','sms','whatsapp','push','app'))
);
comment on table public.dtelco_subscriber is
  'The synthetic subscriber base. Every value is invented: 555 block mobiles, DPS-DTELCO- keys, demo addresses. Contact keyed, so it can be a Dengage remote source.';
comment on column public.dtelco_subscriber.contact_key is
  'Validated to the same shape every server endpoint enforces. A typo here would mint a junk contact in a shared account.';
create index if not exists dtelco_subscriber_lifecycle_idx on public.dtelco_subscriber(lifecycle);
create index if not exists dtelco_subscriber_plan_idx on public.dtelco_subscriber(plan_id);
create index if not exists dtelco_subscriber_address_idx on public.dtelco_subscriber(address_id);

create table if not exists public.dtelco_usage (
  contact_key        text not null references public.dtelco_subscriber(contact_key),
  period_start       date not null,
  data_cap_gb        numeric(8,2) not null,
  data_used_gb       numeric(8,2) not null,
  minutes_cap        integer,
  minutes_used       integer not null default 0,
  sms_cap            integer,
  sms_used           integer not null default 0,
  roaming_days       integer not null default 0,
  balance            numeric(10,2) not null,
  last_topup_at      timestamptz,
  last_topup_amount  numeric(10,2),
  plan_expires_on    date,
  updated_at         timestamptz not null default now(),
  primary key (contact_key, period_start)
);
comment on table public.dtelco_usage is
  'The operator simulator writes here through dtelco-operator, so a remote segment moves during a call. This is the table that makes the demo live rather than staged.';

create table if not exists public.dtelco_billing (
  invoice_id  text primary key,
  contact_key text not null references public.dtelco_subscriber(contact_key),
  issued_at   date not null,
  due_at      date not null,
  amount      numeric(10,2) not null,
  status      text not null,
  constraint dtelco_billing_status check (status in ('issued','due','paid','overdue','renewal_failed','renewal_ok'))
);
create index if not exists dtelco_billing_contact_idx on public.dtelco_billing(contact_key);

create table if not exists public.dtelco_ticket (
  ticket_id   text primary key,
  contact_key text not null references public.dtelco_subscriber(contact_key),
  opened_at   timestamptz not null,
  resolved_at timestamptz,
  channel     text not null,
  topic       text not null,
  status      text not null,
  nps         integer,
  constraint dtelco_ticket_status check (status in ('open','resolved','escalated')),
  constraint dtelco_ticket_nps check (nps is null or (nps between 0 and 10))
);
create index if not exists dtelco_ticket_contact_idx on public.dtelco_ticket(contact_key);

create table if not exists public.dtelco_offline_event (
  id          bigint generated always as identity primary key,
  contact_key text not null references public.dtelco_subscriber(contact_key),
  event_type  text not null,
  product_id  text,
  store_id    text,
  source      text not null,
  note        text,
  event_date  timestamptz not null default now()
);
comment on table public.dtelco_offline_event is
  'Every signal that does not come from the web or the app: BSS, care desk, retail store, chatbot. Same event_type vocabulary as the Dengage custom table, so one profile carries both.';
create index if not exists dtelco_offline_event_contact_idx on public.dtelco_offline_event(contact_key, event_date desc);

create table if not exists public.dtelco_store (
  store_id text primary key,
  name     text not null,
  city     text not null,
  lat      numeric(9,6),
  lng      numeric(9,6)
);
comment on table public.dtelco_store is
  'Reference only. A table about places relates to no contact, so it is never granted to dengage_reader and never offered as a remote source. Store visits reach a profile through dtelco_offline_event instead.';

create table if not exists public.dtelco_web_lead (
  id                bigint generated always as identity primary key,
  contact_key       text,
  form              text not null,
  username          text,
  name              text,
  surname           text,
  email             text,
  gsm               text,
  city              text,
  product_id        text,
  page_url          text,
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  marketing_consent boolean not null default true,
  sms_consent       boolean not null default true,
  whatsapp_consent  boolean not null default true,
  dengage_status    text not null default 'received',
  dengage_detail    text,
  tx_email_status   text,
  tx_push_status    text,
  tx_detail         text,
  created_at        timestamptz not null default now()
);
comment on table public.dtelco_web_lead is
  'Stored before Dengage is called, then patched with what Dengage answered. This row is the audit trail an HTTP 200 cannot give.';
comment on column public.dtelco_web_lead.dengage_status is
  'received, contact inserted, contact updated, rejected, error HTTP n, pending api user. Never left at received once the relay has answered.';

create table if not exists public.dtelco_account (
  username    text primary key,
  contact_key text not null,
  created_at  timestamptz not null default now(),
  constraint dtelco_account_key_shape check (contact_key ~ '^DPS-[A-Za-z0-9_-]{1,44}$')
);
comment on table public.dtelco_account is
  'Registration on the storefront. Username to contact key only. The password is the fixed demo word, validated in the page and never stored, because storing a shared password would be worse than not having one.';

create table if not exists public.dtelco_inbox_template (
  moment     text primary key,
  title      text not null,
  body       text not null,
  updated_at timestamptz not null default now()
);
comment on table public.dtelco_inbox_template is
  'Copy for the demo message centre. Placeholders in braces are filled with the same values the email and push use. Edit here, no deploy.';

create table if not exists public.dtelco_inbox (
  id           bigint generated always as identity primary key,
  contact_key  text,
  device_token text,
  moment       text not null,
  title        text not null,
  body         text not null,
  media_url    text,
  target_url   text,
  channels     text,
  detail       text,
  sent_at      timestamptz not null default now()
);
comment on table public.dtelco_inbox is
  'The demo own message centre. Exists because the Dengage App Inbox fills only from a campaign or a journey, so no transactional send can answer the moment a visitor acted. detail holds Dengage per channel reply and is never returned to the browser.';
create index if not exists dtelco_inbox_contact_idx on public.dtelco_inbox(contact_key, sent_at desc);
create index if not exists dtelco_inbox_token_idx on public.dtelco_inbox(device_token, sent_at desc);

alter table public.dtelco_subscriber     enable row level security;
alter table public.dtelco_usage          enable row level security;
alter table public.dtelco_billing        enable row level security;
alter table public.dtelco_ticket         enable row level security;
alter table public.dtelco_offline_event  enable row level security;
alter table public.dtelco_store          enable row level security;
alter table public.dtelco_web_lead       enable row level security;
alter table public.dtelco_account        enable row level security;
alter table public.dtelco_inbox_template enable row level security;
alter table public.dtelco_inbox          enable row level security;
