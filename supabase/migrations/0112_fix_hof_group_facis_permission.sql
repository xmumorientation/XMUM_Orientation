-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0112: Restore HOF permission to assign Facilitators to groups
--
-- Migration 0080 granted Head of Facilitators (role 'hof') permission to
-- assign facilitators to groups via `is_faci_lead()` (HOF or Admin).
--
-- Migration 0101 later updated `fn_admin_set_group_facis` to audit both
-- the group receiving a facilitator and any groups losing one, but accidentally
-- reverted the permission check from `is_faci_lead()` back to `is_admin()`.
--
-- This caused HOF users on Ops → Faci & Status to receive 'PERMISSION_DENIED'
-- ("You don't have permission to do that.") when saving facilitator assignments.
--
-- This migration restores `if not public.is_faci_lead() then` while keeping
-- the audit improvements from 0101.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.is_faci_lead()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.my_role() in ('hof', 'admin'), false);
$$;

revoke all on function public.is_faci_lead() from public, anon;
grant execute on function public.is_faci_lead() to authenticated;

create or replace function public.fn_admin_set_group_facis(p_group_id integer, p_user_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_ids uuid[] := coalesce(p_user_ids, '{}');
  v_from integer[];
  v_g integer;
begin
  if not public.is_faci_lead() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not exists (select 1 from public.groups where id = p_group_id) then
    raise exception 'GROUP_NOT_FOUND';
  end if;
  if exists (
     select 1 from unnest(v_ids) u
      where not exists (select 1 from public.profiles p where p.id = u and p.role = 'faci')
  ) then
    raise exception 'NOT_A_FACI';
  end if;

  -- The groups the picked Faci are leaving.
  select coalesce(array_agg(distinct group_id), '{}') into v_from
    from public.profiles
   where id = any (v_ids) and group_id is not null and group_id <> p_group_id;

  -- Untick: Faci in this group who are not picked lose their group.
  update public.profiles set group_id = null
   where role = 'faci' and group_id = p_group_id and not (id = any (v_ids));
  delete from public.user_group_assignments ga
   where ga.group_id = p_group_id
     and exists (select 1 from public.profiles p where p.id = ga.user_id and p.role = 'faci')
     and not (ga.user_id = any (v_ids));

  -- Tick: picked Faci join this group (moving from any other group).
  update public.profiles set group_id = p_group_id
   where id = any (v_ids) and group_id is distinct from p_group_id;
  insert into public.user_group_assignments (user_id, group_id, source, created_by, updated_by)
  select u, p_group_id, 'admin', auth.uid(), auth.uid() from unnest(v_ids) u
  on conflict (user_id) do update
    set group_id = excluded.group_id, source = excluded.source, updated_by = auth.uid();

  perform public.audit('group.faci_set', 'group:' || p_group_id,
    jsonb_build_object('user_ids', v_ids));

  -- Each group that lost a Faci to this one gets its own row: its roster now.
  foreach v_g in array v_from loop
    perform public.audit('group.faci_set', 'group:' || v_g,
      jsonb_build_object(
        'user_ids', coalesce((select array_agg(id) from public.profiles where role = 'faci' and group_id = v_g), '{}'::uuid[]),
        'moved_to', p_group_id));
  end loop;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fn_admin_set_group_facis(integer, uuid[]) from public, anon;
grant execute on function public.fn_admin_set_group_facis(integer, uuid[]) to authenticated;
