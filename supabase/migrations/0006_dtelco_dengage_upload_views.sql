-- The two Dengage upload shapes, emitted from the catalogue so a change is a re-download
-- rather than a hand edit. Column order is byte for byte the header in brief A6.1: the demo
-- owner downloads and uploads without touching the file.
--
-- Conventions mirrored from the sample row Dengage supplied:
--   publish_date  DD-MM-YYYY HH:MM
--   is_active     TRUE or FALSE in capitals
--   prices        plain decimals, no currency sign
--   tags          comma separated inside the quoted field
-- The byte order mark and the CSV quoting are added by dtelco-product-feed, not here.
--
-- These two views are NOT granted to dengage_reader. They describe products, relate to no
-- contact, and would never be offered as a remote source anyway.

-- create or replace cannot change a view column's type, so these are dropped and rebuilt when
-- the shape changes. Both are objects this build created and neither is granted to
-- dengage_reader, so nothing outside the dtelco_ prefix is affected.
drop view if exists public.v_dtelco_dengage_product;
drop view if exists public.v_dtelco_dengage_product_variant;

create view public.v_dtelco_dengage_product with (security_invoker = true) as
select
  to_char(p.publish_date, 'DD-MM-YYYY HH24:MI')                       as publish_date,
  case when p.is_active then 'TRUE' else 'FALSE' end                  as is_active,
  p.stock_count                                                       as stock_count,
  -- Money leaves here already formatted. A numeric column serialises as 465 rather than
  -- 465.00, and the feed then disagrees with the committed file while both look right alone.
  to_char(p.price, 'FM9999999990.00')                                 as price,
  to_char(p.discounted_price, 'FM9999999990.00')                      as discounted_price,
  p.product_id                                                        as product_id,
  p.title                                                             as title,
  p.description                                                       as description,
  p.category_path                                                     as category_path,
  p.brand                                                             as brand,
  'https://d-telco.github.io/telco/' || p.link_path                   as link,
  'https://d-telco.github.io/telco/' || p.link_path                   as mobile_web_link,
  'dtelco://product/' || p.product_id                                 as android_deep_link,
  'https://d-telco.github.io/telco/' || p.link_path                   as ios_deep_link,
  'https://d-telco.github.io/telco/assets/catalog/' || p.image_slug || '-1200.jpg' as image_link,
  'https://d-telco.github.io/telco/assets/catalog/' || p.image_slug || '-400.jpg'  as small_image_link,
  'https://d-telco.github.io/telco/assets/catalog/' || p.image_slug || '-1600.jpg' as large_image_link,
  p.store_name                                                        as store_name,
  coalesce(p.parent_id, '')                                           as parent_id,
  p.title                                                             as trans_title,
  array_to_string(p.tags, ',')                                        as tags
from public.dtelco_product p
order by p.category_path, p.product_id;

comment on view public.v_dtelco_dengage_product is
  'Emits the product upload CSV. android_deep_link carries the scheme, not the https URL, because the column is asked to be a deep link: the app registers the https App Link intent filter as well, so an https link opens the app once assetlinks.json carries the signing fingerprint, and no row here has to change when it does.';

create view public.v_dtelco_dengage_product_variant with (security_invoker = true) as
select
  v.stock_count                                                       as stock_count,
  to_char(v.price, 'FM9999999990.00')                                 as price,
  to_char(v.discounted_price, 'FM9999999990.00')                      as discounted_price,
  v.product_variant_id                                                as product_variant_id,
  v.product_id                                                        as product_id,
  v.title                                                             as title,
  'https://d-telco.github.io/telco/assets/catalog/' || v.image_slug || '-1200.jpg' as image_link,
  'https://d-telco.github.io/telco/assets/catalog/' || v.image_slug || '-400.jpg'  as small_image_link,
  'https://d-telco.github.io/telco/assets/catalog/' || v.image_slug || '-1600.jpg' as large_image_link,
  coalesce(v.size, '')                                                as size,
  coalesce(v.color, '')                                               as color,
  coalesce(v.gender, '')                                              as gender,
  coalesce(v.age_interval, '')                                        as age_interval,
  v.store_name                                                        as store_name
from public.dtelco_product_variant v
order by v.product_id, v.product_variant_id;
