-- General Committee has HOF's read access, with no event-data writes.
-- A table guard also covers legacy SECURITY DEFINER RPCs and permissive RLS.
-- Other roles keep their existing permission checks. This attaches only to
-- current public tables; new event tables must carry the same guard.
begin;

create or replace function public.guard_committee_read_only()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if public.my_role() = 'committee' then
    raise exception 'COMMITTEE_READ_ONLY' using errcode = '42501';
  end if;
  return null; -- statement trigger: the return value is ignored
end;
$$;
revoke all on function public.guard_committee_read_only() from public, anon, authenticated;

do $$
declare t record;
begin
  for t in select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('drop trigger if exists committee_read_only on public.%I', t.relname);
    execute format(
      'create trigger committee_read_only before insert or update or delete or truncate on public.%I for each statement execute function public.guard_committee_read_only()',
      t.relname
    );
  end loop;
end;
$$;

-- Faci & Status includes the same group history HOF can see.
drop policy if exists "committee reads audit log" on public.audit_log;
create policy "committee reads audit log" on public.audit_log
  for select to authenticated using (public.my_role() = 'committee');

commit;
