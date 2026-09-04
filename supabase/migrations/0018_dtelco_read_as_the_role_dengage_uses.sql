-- Reading the catalogue as the role the platform connects with.
--
-- Edge functions read Postgres as the service role, which bypasses RLS and holds every grant. The
-- platform connects as dengage_reader. A view with security_invoker resolves for a role exactly
-- when that role can select every relation the view reads, transitively, so the two connections
-- can see different things.
--
-- SET ROLE is not permitted inside a security-definer function:
--
--   42501: cannot set parameter "role" within security-definer function
--
-- It is not needed. The question is a static fact about the catalogue, so the probe walks
-- pg_rewrite and pg_depend to the base relations and checks the grant on each. That needs no rows
-- to exist, and unlike a count it cannot be masked by an empty table.
--
-- A view not granted to dengage_reader at all is a different answer from one that is granted and
-- blocked. The first is deliberate: the two product shaped upload views are never offered. The
-- second is a segment that cannot resolve in the panel. Both are reported as they are.

drop function if exists public.dtelco_reader_probe();

create function public.dtelco_reader_probe()
returns table (view_name text, resolves boolean, blocked_on text)
language plpgsql
security definer
set search_path = public
as $$
declare v record; blockers text[];
begin
  for v in
    select c.oid, c.relname as name
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relkind = 'v'
       and c.relname like 'v\_dtelco\_%'
     order by c.relname
  loop
    if not has_table_privilege('dengage_reader', v.oid, 'SELECT') then
      view_name := v.name; resolves := false; blocked_on := 'the view itself is not granted';
      return next;
      continue;
    end if;

    -- A view of a view of a table is followed the whole way, because the missing grant is usually
    -- at the bottom rather than one step down.
    with recursive deps as (
      select v.oid as rel
      union
      select d.refobjid
        from deps
        join pg_rewrite r on r.ev_class = deps.rel
        join pg_depend d on d.objid = r.oid
       where d.refclassid = 'pg_class'::regclass
         and d.deptype = 'n'
         and d.refobjid <> deps.rel
    )
    select array_agg(distinct c.relname::text order by c.relname::text)
      into blockers
      from deps
      join pg_class c on c.oid = deps.rel
     where c.relkind in ('r','v','m','f','p')
       and not has_table_privilege('dengage_reader', c.oid, 'SELECT');

    view_name := v.name;
    resolves := blockers is null;
    blocked_on := case when blockers is null then null
                       else 'no select on ' || array_to_string(blockers, ', ') end;
    return next;
  end loop;
end $$;

comment on function public.dtelco_reader_probe() is
  'Per v_dtelco_ view: does it resolve for dengage_reader, and if not which base relation blocks it. A static dependency walk, because SET ROLE is not allowed in a security-definer function and because a count can be masked by an empty table.';

revoke all on function public.dtelco_reader_probe() from public;
grant execute on function public.dtelco_reader_probe() to service_role;
