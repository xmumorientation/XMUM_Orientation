-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0080: Head of Facilitators assigns Facilitators to groups
--
-- HOF's Ops page (Faci control) lists every group with its Facilitators,
-- headcount, latest location update and recent changes. Everything there is
-- read through existing Committee-tier policies (is_committee()). The one
-- thing HOF may change is which Facilitators belong to which group:
-- fn_admin_set_group_facis (0068), until now Admin only.
--
-- New helper is_faci_lead(): HOF or Admin, and false (never NULL) for a
-- caller who is not logged in, the same shape as is_game_lead() (0071).
-- Name, slogan, headcount and location stay as they are: HOF reads them only.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.is_faci_lead()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.my_role() in ('hof', 'admin'), false);
$$;

revoke all on function public.is_faci_lead() from public, anon;
grant execute on function public.is_faci_lead() to authenticated;

-- 0068's body; only the permission check changes (is_admin() → is_faci_lead()).
create or replace function public.fn_admin_set_group_facis(p_group_id integer, p_user_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_ids uuid[] := coalesce(p_user_ids, '{}');
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
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fn_admin_set_group_facis(integer, uuid[]) from public, anon;
grant execute on function public.fn_admin_set_group_facis(integer, uuid[]) to authenticated;
