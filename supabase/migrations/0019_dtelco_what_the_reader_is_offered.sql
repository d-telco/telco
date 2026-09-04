-- What dengage_reader can select, which is what the remote source picker offers.
--
-- Remote tables relate to master_contact or master_device. Reference tables about products or
-- places are not offered as remote sources and are not connected.
--
-- That holds today because the migrations do not grant dtelco_product, dtelco_product_variant,
-- dtelco_product_relation, dtelco_bundle_item or dtelco_store to the reporting role. One
-- convenience grant in a future migration would put the product catalogue in the picker with
-- nothing to say so. This function makes the surface readable, and tools/check-backend.mjs
-- asserts what is on it.

create or replace function public.dtelco_reader_surface()
returns table (object_name text, kind text, reader_can_select boolean, is_contact_keyed boolean)
language sql
security definer
set search_path = public
as $$
  select c.relname::text,
         case c.relkind when 'r' then 'table' when 'v' then 'view' end::text,
         has_table_privilege('dengage_reader', c.oid, 'SELECT'),
         exists (
           select 1 from pg_attribute a
            where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
              and a.attname in ('contact_key', 'device_id')
         )
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'v')
     -- Parenthesised deliberately. Without them the or binds looser than the ands and the filter
     -- collapses to every view in the schema, which is how a check ends up passing on the wrong set.
     and (c.relname like 'dtelco%' or c.relname like 'v\_dtelco\_%')
   order by 1;
$$;

comment on function public.dtelco_reader_surface() is
  'Every dtelco object and whether dengage_reader can select it. A remote source picker offers exactly this, so a reference table appearing here is the rule being broken.';

revoke all on function public.dtelco_reader_surface() from public;
grant execute on function public.dtelco_reader_surface() to service_role;
