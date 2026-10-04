-- Changing a user's role on Admin → Users calls fn_admin_update_profile.
-- That function still rejected anything except freshie, faci, gm, and admin,
-- which is the INVALID_ROLE shown when HOF or HOGM is selected.

create or replace function public.fn_admin_update_profile(
  p_user_id uuid,
  p_role public.user_role,
  p_group_id integer,
  p_station_id integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_role not in (
    'freshie', 'faci', 'gm', 'guardian_gm', 'hof', 'hogm', 'committee', 'admin'
  ) then
    raise exception 'INVALID_ROLE';
  end if;

  select jsonb_build_object(
           'role', role,
           'group_id', group_id,
           'station_id', station_id
         )
    into v_before
    from public.profiles
   where id = p_user_id;
  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  update public.profiles
     set role = p_role,
         group_id = case when p_role in ('freshie', 'faci') then p_group_id end,
         station_id = case when p_role = 'gm' then p_station_id end,
         admin_team = case when p_role = 'admin' then admin_team end,
         approved = true
   where id = p_user_id;

  if p_role in ('freshie', 'faci') and p_group_id is not null then
    insert into public.user_group_assignments
      (user_id, group_id, source, created_by, updated_by)
    values (p_user_id, p_group_id, 'admin', auth.uid(), auth.uid())
    on conflict (user_id) do update set
      group_id = excluded.group_id,
      source = excluded.source,
      updated_by = auth.uid();
  else
    delete from public.user_group_assignments where user_id = p_user_id;
  end if;

  if p_role = 'gm' and p_station_id is not null then
    insert into public.gm_station_assignments
      (user_id, day, station_id, created_by, updated_by)
    select p_user_id, d.day, p_station_id, auth.uid(), auth.uid()
    from (values (1), (2)) as d(day)
    on conflict (user_id, day) do update set
      station_id = excluded.station_id,
      updated_by = auth.uid();
  else
    delete from public.gm_station_assignments where user_id = p_user_id;
  end if;

  perform public.audit(
    'user.update',
    'user:' || p_user_id,
    jsonb_build_object(
      'before', v_before,
      'after', jsonb_build_object(
        'role', p_role,
        'group_id', p_group_id,
        'station_id', p_station_id
      )
    )
  );
  return jsonb_build_object('ok', true);
end;
$$;
