-- Section 4: Admin account registry allocation.
-- Single-orientation schema: no event_id columns are required.

alter table public.user_group_assignments
  add column if not exists version bigint not null default 1;
alter table public.gm_station_assignments
  add column if not exists version bigint not null default 1;

create table if not exists public.allocation_audit (
  id               bigserial primary key,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  role             public.user_role not null,
  day              smallint check (day is null or day in (1, 2)),
  old_group_id     integer references public.groups(id),
  new_group_id     integer references public.groups(id),
  old_station_id   integer references public.stations(id),
  new_station_id   integer references public.stations(id),
  edited_by        uuid not null references public.profiles(id),
  edited_at        timestamptz not null default now(),
  reason           text,
  check (role in ('faci', 'gm'))
);

create index if not exists allocation_audit_user_idx
  on public.allocation_audit(user_id, edited_at desc);
create index if not exists allocation_audit_editor_idx
  on public.allocation_audit(edited_by, edited_at desc);

alter table public.allocation_audit enable row level security;
drop policy if exists "admin reads allocation audit" on public.allocation_audit;
create policy "admin reads allocation audit" on public.allocation_audit
  for select using (public.has_permission('allocation.manage'));

create or replace function public.bump_assignment_version()
returns trigger language plpgsql set search_path = public as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

drop trigger if exists bump_group_assignment_version on public.user_group_assignments;
create trigger bump_group_assignment_version
  before update on public.user_group_assignments
  for each row execute function public.bump_assignment_version();

drop trigger if exists bump_gm_assignment_version on public.gm_station_assignments;
create trigger bump_gm_assignment_version
  before update on public.gm_station_assignments
  for each row execute function public.bump_assignment_version();

create or replace function public.fn_admin_assign_faci(
  p_user_id uuid,
  p_group_id integer,
  p_expected_version bigint default 0,
  p_reason text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_old_group integer;
  v_version bigint;
  v_rows integer;
begin
  if not public.has_permission('allocation.manage') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not exists (
    select 1 from public.profiles where id = p_user_id and role = 'faci'
  ) then
    raise exception 'FACI_ACCOUNT_NOT_FOUND';
  end if;
  if p_group_id is not null and not exists (
    select 1 from public.groups where id = p_group_id and is_active
  ) then
    raise exception 'INVALID_GROUP_ASSIGNMENT';
  end if;

  select group_id, version into v_old_group, v_version
    from public.user_group_assignments
   where user_id = p_user_id
   for update;

  if found and v_version <> p_expected_version then
    raise exception 'ALLOCATION_CONFLICT';
  elsif not found and coalesce(p_expected_version, 0) <> 0 then
    raise exception 'ALLOCATION_CONFLICT';
  end if;

  if p_group_id is null then
    delete from public.user_group_assignments
     where user_id = p_user_id and version = p_expected_version;
  elsif v_version is null then
    begin
      insert into public.user_group_assignments
        (user_id, group_id, source, created_by, updated_by)
      values (p_user_id, p_group_id, 'admin', auth.uid(), auth.uid());
    exception when unique_violation then
      raise exception 'ALLOCATION_CONFLICT';
    end;
  else
    update public.user_group_assignments
       set group_id = p_group_id, source = 'admin', updated_by = auth.uid()
     where user_id = p_user_id and version = p_expected_version;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'ALLOCATION_CONFLICT'; end if;
  end if;

  if v_old_group is distinct from p_group_id then
    insert into public.allocation_audit
      (user_id, role, old_group_id, new_group_id, edited_by, reason)
    values
      (p_user_id, 'faci', v_old_group, p_group_id, auth.uid(), nullif(trim(coalesce(p_reason, '')), ''));
    perform public.audit(
      'allocation.faci',
      'user:' || p_user_id,
      jsonb_build_object('old_group_id', v_old_group, 'new_group_id', p_group_id)
    );
  end if;

  select version into v_version from public.user_group_assignments where user_id = p_user_id;
  return jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'group_id', p_group_id,
    'version', coalesce(v_version, 0)
  );
end;
$$;

create or replace function public.fn_admin_assign_gm_stations(
  p_user_id uuid,
  p_day1_station_id integer,
  p_day2_station_id integer,
  p_day1_expected_version bigint default 0,
  p_day2_expected_version bigint default 0,
  p_reason text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_day integer;
  v_station integer;
  v_expected bigint;
  v_old integer;
  v_version bigint;
  v_rows integer;
begin
  if not public.has_permission('allocation.manage') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not exists (
    select 1 from public.profiles where id = p_user_id and role = 'gm'
  ) then
    raise exception 'GM_ACCOUNT_NOT_FOUND';
  end if;
  if p_day1_station_id is not null and not exists (
    select 1 from public.stations
     where id = p_day1_station_id and is_active and (day is null or day = 1)
  ) then raise exception 'INVALID_DAY1_STATION'; end if;
  if p_day2_station_id is not null and not exists (
    select 1 from public.stations
     where id = p_day2_station_id and is_active and (day is null or day = 2)
  ) then raise exception 'INVALID_DAY2_STATION'; end if;

  for v_day in 1..2 loop
    v_station := case v_day when 1 then p_day1_station_id else p_day2_station_id end;
    v_expected := case v_day when 1 then p_day1_expected_version else p_day2_expected_version end;
    v_old := null;
    v_version := null;

    select station_id, version into v_old, v_version
      from public.gm_station_assignments
     where user_id = p_user_id and day = v_day
     for update;

    if found and v_version <> v_expected then
      raise exception 'ALLOCATION_CONFLICT';
    elsif not found and coalesce(v_expected, 0) <> 0 then
      raise exception 'ALLOCATION_CONFLICT';
    end if;

    if v_station is null then
      delete from public.gm_station_assignments
       where user_id = p_user_id and day = v_day and version = v_expected;
    elsif v_version is null then
      begin
        insert into public.gm_station_assignments
          (user_id, day, station_id, created_by, updated_by)
        values (p_user_id, v_day, v_station, auth.uid(), auth.uid());
      exception when unique_violation then
        raise exception 'ALLOCATION_CONFLICT';
      end;
    else
      update public.gm_station_assignments
         set station_id = v_station, updated_by = auth.uid()
       where user_id = p_user_id and day = v_day and version = v_expected;
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then raise exception 'ALLOCATION_CONFLICT'; end if;
    end if;

    if v_old is distinct from v_station then
      insert into public.allocation_audit
        (user_id, role, day, old_station_id, new_station_id, edited_by, reason)
      values
        (p_user_id, 'gm', v_day, v_old, v_station, auth.uid(), nullif(trim(coalesce(p_reason, '')), ''));
      perform public.audit(
        'allocation.gm_station',
        'user:' || p_user_id,
        jsonb_build_object('day', v_day, 'old_station_id', v_old, 'new_station_id', v_station)
      );
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'user_id', p_user_id);
end;
$$;

revoke all on function public.fn_admin_assign_faci(uuid, integer, bigint, text) from public, anon;
revoke all on function public.fn_admin_assign_gm_stations(uuid, integer, integer, bigint, bigint, text) from public, anon;
grant execute on function public.fn_admin_assign_faci(uuid, integer, bigint, text) to authenticated;
grant execute on function public.fn_admin_assign_gm_stations(uuid, integer, integer, bigint, bigint, text) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.allocation_audit;
exception when duplicate_object then null;
end $$;
