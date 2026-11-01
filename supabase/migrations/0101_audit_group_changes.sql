-- Faci & Status → a group's Recent changes: three changes that did not show.
--
-- 1. A Faci renaming the group or editing its slogan (fn_set_group_profile)
--    wrote no audit row. It now writes group.profile_set.
-- 2. Moving a Faci out of one group into another (fn_admin_set_group_facis)
--    logged only on the group they joined. The group they left now gets a
--    group.faci_set row with its new roster.
-- 3. Admin clearing a Faci's photo or intro (fn_admin_clear_faci_profile)
--    named only the account, so no group's log showed it. detail.group_id now
--    carries the Faci's group.

create or replace function public.fn_set_group_profile(
  p_display_name text,
  p_slogan text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(btrim(p_display_name), '');
  v_slogan text := nullif(btrim(p_slogan), '');
  v_group integer := public.my_group_id();
  v_old_name text;
  v_old_slogan text;
begin
  if public.my_role() is distinct from 'faci' then
    raise exception 'FACI_ONLY';
  end if;
  if v_group is null then
    raise exception 'NOT_IN_GROUP';
  end if;
  if v_name is null then
    raise exception 'GROUP_NAME_REQUIRED';
  end if;
  if char_length(v_name) > 40 then
    raise exception 'NAME_TOO_LONG';
  end if;
  if v_slogan is not null and char_length(v_slogan) > 80 then
    raise exception 'SLOGAN_TOO_LONG';
  end if;

  select display_name, slogan into v_old_name, v_old_slogan from public.groups where id = v_group;

  update public.groups
     set display_name = v_name,
         slogan = v_slogan
   where id = v_group;

  if v_old_name is distinct from v_name or v_old_slogan is distinct from v_slogan then
    perform public.audit('group.profile_set', 'group:' || v_group,
      jsonb_build_object(
        'before', jsonb_build_object('name', v_old_name, 'slogan', v_old_slogan),
        'after', jsonb_build_object('name', v_name, 'slogan', v_slogan)));
  end if;
exception
  when unique_violation then
    raise exception 'NAME_TAKEN';
end;
$$;

create or replace function public.fn_admin_set_group_facis(p_group_id integer, p_user_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_ids uuid[] := coalesce(p_user_ids, '{}');
  v_from integer[];
  v_g integer;
begin
  if not public.is_admin() then
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

create or replace function public.fn_admin_clear_faci_profile(
  p_user_id uuid,
  p_fields  text[]
) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_fields, '{}')) f
     where f not in ('avatar_path', 'intro')
  ) then
    raise exception 'INVALID_FIELD';
  end if;

  update public.faci_profiles
     set avatar_path = case when 'avatar_path' = any(p_fields) then null else avatar_path end,
         intro       = case when 'intro'       = any(p_fields) then null else intro end,
         updated_at  = now()
   where user_id = p_user_id;

  perform public.audit('faci_profile.clear', p_user_id::text,
    jsonb_build_object(
      'fields', to_jsonb(p_fields),
      'group_id', (select group_id from public.profiles where id = p_user_id)));
end;
$$;
