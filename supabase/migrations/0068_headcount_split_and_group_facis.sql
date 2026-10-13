-- Migration 0068: Local / International headcount, and Faci assignment by group.
--
-- A. group_headcounts gets two optional counts. NULL = "not counted", never 0.
--    Existing rows keep their Total; the split starts blank.
-- B. fn_set_headcount takes the split too (Total stays required).
-- C. fn_admin_set_group_facis: tick-and-save Faci assignment for one group.
--    Writes the same profiles.group_id (and user_group_assignments mirror) that
--    Admin Settings > User writes, so both places stay in sync.

-- ── A. Columns ─────────────────────────────────────────────────────────

alter table public.group_headcounts
  add column if not exists local_count integer check (local_count is null or local_count >= 0),
  add column if not exists international_count integer check (international_count is null or international_count >= 0);

-- ── B. fn_set_headcount with the split ─────────────────────────────────

drop function if exists public.fn_set_headcount(integer, integer);

create or replace function public.fn_set_headcount(
  p_count integer,
  p_group_id integer default null,
  p_local integer default null,
  p_international integer default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.user_role := public.my_role();
  v_group integer;
  v_before jsonb;
begin
  if v_role not in ('faci', 'hof', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_count is null or p_count < 0
     or p_local < 0 or p_international < 0 then
    raise exception 'INVALID_COUNT';
  end if;

  if v_role = 'admin' then
    if p_group_id is null then
      raise exception 'GROUP_ID_REQUIRED_FOR_ADMIN';
    end if;
    v_group := p_group_id;
  else
    v_group := public.my_group_id();
    if v_group is null then
      raise exception 'NOT_IN_GROUP';
    end if;
  end if;

  select jsonb_build_object('total', headcount, 'local', local_count, 'international', international_count)
    into v_before from public.group_headcounts where group_id = v_group;

  insert into public.group_headcounts
    (group_id, headcount, local_count, international_count, updated_by, updated_at)
  values (v_group, p_count, p_local, p_international, auth.uid(), now())
  on conflict (group_id) do update
    set headcount = excluded.headcount,
        local_count = excluded.local_count,
        international_count = excluded.international_count,
        updated_by = excluded.updated_by,
        updated_at = now();

  perform public.audit('headcount.set', 'group:' || v_group,
    jsonb_build_object(
      'before', v_before,
      'after', jsonb_build_object('total', p_count, 'local', p_local, 'international', p_international)));
  return jsonb_build_object('ok', true);
end;
$$;

-- ── C. Faci assignment per group ───────────────────────────────────────

create or replace function public.fn_admin_set_group_facis(p_group_id integer, p_user_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_ids uuid[] := coalesce(p_user_ids, '{}');
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
