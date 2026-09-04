-- The synthetic subscriber base: 2000 lines plus the eight engineered personas.
--
-- Determinism matters more than it looks. a deterministic seed makes quoted
-- segment sizes exact, so a presenter can say "four hundred and six people" and have the panel
-- agree. random() with setseed is only deterministic inside one session, and these statements
-- do not share one, so every value below is derived from hashtext() of the row's own key. Same
-- input, same database, every time, from any session.
--
-- Every value announces itself as invented: 555 block mobiles, DPS-DTELCO- keys, demo addresses.

-- Stores. Reference only: a table about places relates to no contact, is never granted to
-- dengage_reader and is never offered as a remote source. A store visit reaches a profile
-- through dtelco_offline_event instead.
insert into public.dtelco_store (store_id, name, city, lat, lng) values
  ('st-baku-28may',    'D-TELCO 28 May',      'Baku',        40.379600, 49.849700),
  ('st-baku-nizami',   'D-TELCO Nizami',      'Baku',        40.372600, 49.836700),
  ('st-baku-ganjlik',  'D-TELCO Ganjlik',     'Baku',        40.404300, 49.851900),
  ('st-baku-airport',  'D-TELCO Airport',     'Baku',        40.462500, 50.046700),
  ('st-ganja-central', 'D-TELCO Ganja',       'Ganja',       40.682800, 46.361600),
  ('st-sumqayit',      'D-TELCO Sumqayit',    'Sumqayit',    40.589500, 49.668600),
  ('st-mingachevir',   'D-TELCO Mingachevir', 'Mingachevir', 40.770000, 47.048600),
  ('st-lankaran',      'D-TELCO Lankaran',    'Lankaran',    38.753500, 48.850600),
  ('st-shirvan',       'D-TELCO Shirvan',     'Shirvan',     39.929700, 48.920800),
  ('st-quba',          'D-TELCO Quba',        'Quba',        41.361400, 48.512800)
on conflict (store_id) do nothing;

-- 2000 subscribers.
with names as (
  select array['Aysel','Rashad','Nigar','Elvin','Leyla','Tural','Kamran','Sevinc','Orkhan',
               'Gunel','Farid','Lamiya','Emin','Nurana','Samir','Aygun','Ramil','Zarifa',
               'Ilkin','Sabina','Murad','Konul','Vusal','Aynur','Elnur','Gulnar'] as first,
         array['Mammadov','Aliyev','Huseynov','Guliyev','Hasanov','Ismayilov','Rahimov',
               'Karimov','Abbasov','Jafarov','Safarov','Musayev','Aghayev','Bayramov',
               'Najafov','Zeynalov'] as last,
         array['Baku','Baku','Baku','Baku','Ganja','Sumqayit','Mingachevir','Lankaran',
               'Shirvan','Quba'] as city
),
plans as (
  select product_id, price, data_gb, minutes, sms, validity_days,
         row_number() over (order by product_id) - 1 as n,
         count(*) over () as total,
         case when category_path like '%Postpaid%' then 'postpaid' else 'prepaid' end as kind
  from public.dtelco_product
  where product_type = 'plan' and is_active
),
devices as (
  select product_id, row_number() over (order by product_id) - 1 as n, count(*) over () as total
  from public.dtelco_product where category_path = 'Shop>Phones'
),
gen as (
  select i,
         'DPS-DTELCO-S' || lpad(i::text, 5, '0')                       as contact_key,
         abs(hashtext('plan'   || i::text))                            as h_plan,
         abs(hashtext('name'   || i::text))                            as h_name,
         abs(hashtext('surn'   || i::text))                            as h_surn,
         abs(hashtext('city'   || i::text))                            as h_city,
         abs(hashtext('dev'    || i::text))                            as h_dev,
         abs(hashtext('life'   || i::text))                            as h_life,
         abs(hashtext('act'    || i::text))                            as h_act,
         abs(hashtext('addr'   || i::text))                            as h_addr,
         abs(hashtext('arpu'   || i::text))                            as h_arpu,
         abs(hashtext('esim'   || i::text))                            as h_esim,
         abs(hashtext('age'    || i::text))                            as h_age,
         abs(hashtext('chan'   || i::text))                            as h_chan
  from generate_series(1, 2000) i
)
insert into public.dtelco_subscriber
  (contact_key, msisdn, full_name, email, city, plan_id, plan_type, activation_date,
   contract_end, device_product_id, device_age_months, arpu, arpu_band, lifecycle, esim,
   family_lines, address_id, preferred_store, preferred_channel, is_persona)
select
  g.contact_key,
  '+994 55 555 ' || lpad((1000 + g.i)::text, 4, '0'),
  (select first[1 + (g.h_name % array_length(first, 1))] from names) || ' ' ||
  (select last[1 + (g.h_surn % array_length(last, 1))] from names),
  null,                                              -- addresses supplied at setup
  (select city[1 + (g.h_city % array_length(city, 1))] from names),
  p.product_id,
  p.kind,
  current_date - (g.h_act % 1400),
  case when p.kind = 'postpaid' then current_date + ((g.h_act % 800) - 200) end,
  d.product_id,
  6 + (g.h_age % 40),
  round((p.price * (0.85 + (g.h_arpu % 40) / 100.0))::numeric, 2),
  case when p.price < 8 then 'low' when p.price < 25 then 'mid' else 'high' end,
  case (g.h_life % 100)
    when 0 then 'churned'
    else case when (g.h_life % 100) < 6  then 'new'
              when (g.h_life % 100) < 74 then 'active'
              when (g.h_life % 100) < 87 then 'dormant'
              else 'at_risk' end
  end,
  (g.h_esim % 100) < 34,
  1,
  'ADDR-' || lpad(((g.h_addr % 1500) + 1)::text, 4, '0'),   -- collisions make family candidates
  (select store_id from public.dtelco_store order by store_id offset (g.h_city % 10) limit 1),
  (array['email','sms','whatsapp','push','app'])[1 + (g.h_chan % 5)],
  false
from gen g
join plans p   on p.n = g.h_plan % p.total
join devices d on d.n = g.h_dev  % d.total
on conflict (contact_key) do nothing;
