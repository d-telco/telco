-- the silent failure: a table with RLS enabled and no policy connects
-- fine, authenticates fine, and returns zero rows to every query. A remote source wired that
-- way tests green and every segment built on it is empty. One read policy per contact keyed
-- table for dengage_reader is the fix, and every new table has the same trap.
--
-- The catalogue and the store list get NO policy and NO grant on purpose. the remote source model:
-- only a table relating to master_contact or master_device can be a remote source, so a table
-- about products or places is not offered at all, with no error. Withholding the grant means
-- nobody wastes an afternoon trying.

grant usage on schema public to dengage_reader;

do $$
declare t text;
begin
  foreach t in array array[
    'dtelco_subscriber','dtelco_usage','dtelco_billing','dtelco_ticket',
    'dtelco_offline_event','dtelco_web_lead'
  ] loop
    execute format('grant select on public.%I to dengage_reader', t);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'dengage_remote_read'
    ) then
      execute format(
        'create policy dengage_remote_read on public.%I for select to dengage_reader using (true)', t);
    end if;
  end loop;
end $$;

grant select, insert, update on all tables in schema public to service_role;
