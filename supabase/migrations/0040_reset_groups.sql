-- Freshie control "Reset": delete every group so the admin can recreate them.
-- Rows that need a group (tokens, puzzles, headcounts, ...) are deleted.
-- Rows where the group is optional (profiles, freshies, ...) lose their group.
-- The group login accounts are removed afterwards by POST /api/admin/group-logins.

create or replace function public.fn_reset_groups()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ref record;
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select count(*) into v_count from public.groups;

  -- Every column, in any table, with a foreign key to groups.id that would
  -- block the delete. Keys declared "on delete cascade" or "on delete set null"
  -- are left to Postgres, which follows the table's own rules (some tables
  -- have checks that forbid a null group, so we must not null those ourselves).
  for ref in
    select c.conrelid::regclass as tbl, a.attname as col, a.attnotnull as required
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.groups'::regclass
      and c.conrelid <> 'public.groups'::regclass
      and c.confdeltype in ('a', 'r') -- no action, restrict
  loop
    if ref.required then
      execute format('delete from %s where %I is not null', ref.tbl, ref.col);
    else
      execute format('update %s set %I = null where %I is not null', ref.tbl, ref.col, ref.col);
    end if;
  end loop;

  delete from public.groups where true;

  update public.game_config_rules
     set rule_value = 0, updated_at = now()
   where rule_key = 'TOTAL_GROUPS_COUNT';

  begin
    update public.game_config
       set value = to_jsonb(0), updated_at = now()
     where key = 'freshie_total_groups';
  exception when others then null; end;

  return jsonb_build_object('ok', true, 'deleted', v_count);
end;
$$;

revoke all on function public.fn_reset_groups() from public, anon;
grant execute on function public.fn_reset_groups() to authenticated;
