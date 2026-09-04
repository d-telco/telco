-- D-TELCO catalogue. Reference data about products, not about people.
--
-- These four tables deliberately carry NO contact_key and are deliberately NOT granted to
-- dengage_reader. a remote table has to relate to master_contact or
-- master_device, and a table about products is simply not offered as a remote source, with no
-- error. Granting them would invite somebody to try, so the grant is withheld on purpose.
-- The site, the app and the Dengage upload CSVs read them through the service role instead.

create table if not exists public.dtelco_product (
  product_id        text primary key,
  title             text        not null,
  description       text        not null,
  category_path     text        not null,
  brand             text        not null,
  product_type      text        not null,
  family            text,
  price             numeric(12,2) not null,
  discounted_price  numeric(12,2) not null,
  stock_count       integer,
  is_active         boolean     not null default true,
  publish_date      timestamptz not null,
  store_name        text        not null,
  parent_id         text,
  tags              text[]      not null default '{}',
  link_path         text        not null,
  image_slug        text        not null,
  -- Site and app only. The Dengage product table has no column for these, so they travel in
  -- the JSON feed and never in the CSV.
  ussd_code         text,
  validity_days     integer,
  data_gb           numeric(8,2),
  social_gb         numeric(8,2),
  ai_gb             numeric(8,2),
  minutes           integer,
  sms               integer,
  roaming_zone      text,
  speed_mbps        integer,
  instalment_months integer[],
  free_apps         text[],
  -- Every figure nobody published is a plausible demo figure and says so.
  demo_data         boolean     not null default true,
  created_at        timestamptz not null default now(),
  constraint dtelco_product_price_nonneg check (price >= 0 and discounted_price >= 0),
  constraint dtelco_product_discount_sane check (discounted_price <= price),
  constraint dtelco_product_category_shape check (category_path ~ '^[A-Za-z0-9 +.-]+(>[A-Za-z0-9 +.-]+)*$'),
  constraint dtelco_product_type_known check (product_type in
    ('plan','internet','addon','roaming','device','accessory','sim','esim','number','fixed','service','bundle'))
);
comment on table public.dtelco_product is
  'D-TELCO catalogue master. Reference data, never a Dengage remote source: it relates to no contact. Emitted to Dengage as a CSV through v_dtelco_dengage_product.';
comment on column public.dtelco_product.stock_count is
  'Real integer for devices and accessories, zeros included for the back in stock story. 9999 for plans, packs and services so they never read as out of stock. Never null-cast to 0: Number(null) is 0 and a 0 here announces every product out of stock.';
comment on column public.dtelco_product.demo_data is
  'True where the figure is a plausible invented one rather than a published one. Surfaced in tags as demo-data so a panel viewer can tell them apart.';

create table if not exists public.dtelco_product_variant (
  product_variant_id text primary key,
  product_id         text not null references public.dtelco_product(product_id),
  title              text not null,
  price              numeric(12,2) not null,
  discounted_price   numeric(12,2) not null,
  stock_count        integer,
  size               text,
  color              text,
  gender             text,
  age_interval       text,
  store_name         text not null,
  image_slug         text not null,
  created_at         timestamptz not null default now(),
  constraint dtelco_variant_price_nonneg check (price >= 0 and discounted_price >= 0)
);
comment on table public.dtelco_product_variant is
  'One row per buyable configuration. A product with one configuration carries a variant whose id equals its product_id: that is the fallback the events module uses, and a product that is its own only variant is a fact, not a gap.';
create index if not exists dtelco_product_variant_product_idx on public.dtelco_product_variant(product_id);

create table if not exists public.dtelco_product_relation (
  id              bigint generated always as identity primary key,
  from_product_id text not null references public.dtelco_product(product_id),
  to_product_id   text not null references public.dtelco_product(product_id),
  relation        text not null,
  rank            integer not null default 1,
  note            text,
  constraint dtelco_relation_known check (relation in
    ('upsell','downsell','cross_sell','bundle_contains','compatible_with','requires','alternative','renews_to','upgrade_of')),
  constraint dtelco_relation_not_self check (from_product_id <> to_product_id),
  unique (from_product_id, to_product_id, relation)
);
comment on table public.dtelco_product_relation is
  'Every relation is the basis of a visible use case. rank 1 is the best answer; the recommendation engine reads ascending.';

create table if not exists public.dtelco_bundle_item (
  bundle_id  text not null references public.dtelco_product(product_id),
  product_id text not null references public.dtelco_product(product_id),
  quantity   integer not null default 1,
  note       text,
  primary key (bundle_id, product_id)
);
comment on table public.dtelco_bundle_item is
  'Bundle membership lives here and in tags, not in parent_id, because a product can belong to several bundles and parent_id holds only one.';

alter table public.dtelco_product          enable row level security;
alter table public.dtelco_product_variant  enable row level security;
alter table public.dtelco_product_relation enable row level security;
alter table public.dtelco_bundle_item      enable row level security;
