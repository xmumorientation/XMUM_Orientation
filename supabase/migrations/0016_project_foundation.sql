-- Section 1: shared single-orientation technical foundation.
-- Adds canonical allocations, day-specific GM assignments, common metadata,
-- request/idempotency support, and an authenticated context resolver.

-- ── Shared account metadata ─────────────────────────────────────────────

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists admin_team text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_by uuid references public.profiles(id);

alter table public.profiles drop constraint if exists profiles_admin_team_valid;
alter table public.profiles add constraint profiles_admin_team_valid check (
  admin_team is null or (role = 'admin' and admin_team in ('HOF', 'HOGM', 'TECH'))
);

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username)) where username is not null;

-- ── Stable group/station identifiers and lifecycle metadata ─────────────

alter table public.groups add column if not exists group_number integer;
alter table public.groups add column if not exists is_active boolean not null default true;
alter table public.groups add column if not exists updated_at timestamptz not null default now();
alter table public.groups add column if not exists created_by uuid references public.profiles(id);
alter table public.groups add column if not exists updated_by uuid references public.profiles(id);
update public.groups set group_number = id where group_number is null;
alter table public.groups alter column group_number set not null;
create unique index if not exists groups_group_number_unique on public.groups(group_number);

alter table public.stations add column if not exists station_number integer;
-- Null means the same station record may be used on both days. Day-specific
-- ownership is always resolved from gm_station_assignments below.
alter table public.stations add column if not exists day smallint;
alter table public.stations add column if not exists is_active boolean not null default true;
alter table public.stations add column if not exists updated_at timestamptz not null default now();
alter table public.stations add column if not exists created_by uuid references public.profiles(id);
alter table public.stations add column if not exists updated_by uuid references public.profiles(id);
update public.stations set station_number = id where station_number is null;
alter table public.stations alter column station_number set not null;
alter table public.stations drop constraint if exists stations_day_valid;
alter table public.stations add constraint stations_day_valid check (day is null or day in (1, 2));
create unique index if not exists stations_number_day_unique
  on public.stations(station_number, coalesce(day, 0));

-- ── Canonical group allocation interface ────────────────────────────────
-- The external Freshie allocation module and Admin Faci allocation both
-- publish their result here. Later modules only consume this shared table.

create table if not exists public.user_group_assignments (
  id          bigserial primary key,
  user_id     uuid not null unique references public.profiles(id) on delete cascade,
  group_id    integer not null references public.groups(id) on delete restrict,
  source      text not null default 'admin',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id),
  updated_by  uuid references public.profiles(id)
);

insert into public.user_group_assignments (user_id, group_id, source)
select id, group_id, 'legacy_profile'
from public.profiles
where group_id is not null and role in ('freshie', 'faci')
on conflict (user_id) do update set
  group_id = excluded.group_id,
  source = excluded.source,
  updated_at = now();

alter table public.user_group_assignments enable row level security;
create policy "read own group assignment" on public.user_group_assignments
  for select using (user_id = auth.uid());
create policy "admin manages group assignments" on public.user_group_assignments
  for all using (public.is_admin()) with check (public.is_admin());

-- ── Day-specific GM allocation ──────────────────────────────────────────

create table if not exists public.gm_station_assignments (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  day         smallint not null check (day in (1, 2)),
  station_id  integer not null references public.stations(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id),
  updated_by  uuid references public.profiles(id),
  unique (user_id, day)
);

-- A former permanent station assignment is copied to both days so current
-- behavior is preserved until Admin edits the day-specific allocations.
insert into public.gm_station_assignments (user_id, day, station_id)
select p.id, d.day, p.station_id
from public.profiles p
cross join (values (1), (2)) as d(day)
where p.role = 'gm' and p.station_id is not null
on conflict (user_id, day) do nothing;

alter table public.gm_station_assignments enable row level security;
create policy "gm reads own station assignments" on public.gm_station_assignments
  for select using (user_id = auth.uid());
create policy "admin manages station assignments" on public.gm_station_assignments
  for all using (public.is_admin()) with check (public.is_admin());

-- ── Shared timestamps ────────────────────────────────────────────────────

create or replace function public.set_updated_metadata()
returns trigger
language plpgsql set search_path = public
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  return new;
end;
$$;

drop trigger if exists profiles_updated_metadata on public.profiles;
create trigger profiles_updated_metadata before update on public.profiles
  for each row execute function public.set_updated_metadata();
drop trigger if exists groups_updated_metadata on public.groups;
create trigger groups_updated_metadata before update on public.groups
  for each row execute function public.set_updated_metadata();
drop trigger if exists stations_updated_metadata on public.stations;
create trigger stations_updated_metadata before update on public.stations
  for each row execute function public.set_updated_metadata();
drop trigger if exists group_assignments_updated_metadata on public.user_group_assignments;
create trigger group_assignments_updated_metadata before update on public.user_group_assignments
  for each row execute function public.set_updated_metadata();
drop trigger if exists gm_assignments_updated_metadata on public.gm_station_assignments;
create trigger gm_assignments_updated_metadata before update on public.gm_station_assignments
  for each row execute function public.set_updated_metadata();

-- Keep the legacy profiles.group_id field synchronized while older screens
-- are migrated section by section. The assignment table is canonical.
create or replace function public.sync_profile_group_assignment()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.profiles set group_id = null
      where id = old.user_id and group_id is not null;
    return old;
  end if;
  update public.profiles set group_id = new.group_id
    where id = new.user_id and group_id is distinct from new.group_id;
  return new;
end;
$$;

drop trigger if exists sync_profile_group_assignment on public.user_group_assignments;
create trigger sync_profile_group_assignment
  after insert or update or delete on public.user_group_assignments
  for each row execute function public.sync_profile_group_assignment();

-- ── Current day and authenticated allocation context ────────────────────

create or replace function public.current_game_day()
returns smallint
language sql stable security definer set search_path = public
as $$
  select case
    when exists (select 1 from public.phases where key = 'day1' and state in ('active', 'paused')) then 1
    when exists (select 1 from public.phases where key in ('day2', 'endgame') and state in ('active', 'paused')) then 2
    else null
  end::smallint;
$$;

create or replace function public.fn_current_user_context()
returns table (
  user_id uuid,
  role public.user_role,
  group_id integer,
  station_id integer,
  day smallint,
  admin_team text
)
language sql stable security definer set search_path = public
as $$
  select
    p.id,
    p.role,
    uga.group_id,
    gsa.station_id,
    public.current_game_day(),
    p.admin_team
  from public.profiles p
  left join public.user_group_assignments uga on uga.user_id = p.id
  left join public.gm_station_assignments gsa
    on gsa.user_id = p.id and gsa.day = public.current_game_day()
  where p.id = auth.uid()
    and p.role in ('freshie', 'faci', 'gm', 'admin');
$$;

-- ── Audit and retry metadata ─────────────────────────────────────────────

alter table public.audit_log add column if not exists request_id uuid;
alter table public.audit_log add column if not exists transaction_id uuid;
alter table public.audit_log add column if not exists before_state jsonb;
alter table public.audit_log add column if not exists after_state jsonb;
alter table public.audit_log add column if not exists reason text;
create index if not exists audit_log_request_idx on public.audit_log(request_id)
  where request_id is not null;
create index if not exists audit_log_transaction_idx on public.audit_log(transaction_id)
  where transaction_id is not null;

create table if not exists public.idempotency_requests (
  id                bigserial primary key,
  request_id        uuid not null unique,
  idempotency_key   text not null,
  module            text not null,
  action            text not null,
  actor_user_id     uuid references public.profiles(id),
  status            text not null default 'processing'
                    check (status in ('processing', 'completed', 'failed')),
  result            jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles(id),
  unique (module, idempotency_key)
);

alter table public.idempotency_requests enable row level security;
create policy "admin reads idempotency requests" on public.idempotency_requests
  for select using (public.is_admin());
drop trigger if exists idempotency_requests_updated_metadata on public.idempotency_requests;
create trigger idempotency_requests_updated_metadata
  before update on public.idempotency_requests
  for each row execute function public.set_updated_metadata();

-- ── Compatibility-aware Admin assignment RPCs ───────────────────────────

create or replace function public.fn_assign_group(p_user_id uuid, p_group_id integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_before integer;
begin
  if not public.is_admin() then raise exception 'PERMISSION_DENIED'; end if;
  select group_id into v_before from public.user_group_assignments where user_id = p_user_id;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;
  if p_group_id is null then
    delete from public.user_group_assignments where user_id = p_user_id;
  else
    insert into public.user_group_assignments
      (user_id, group_id, source, created_by, updated_by)
    values (p_user_id, p_group_id, 'admin', auth.uid(), auth.uid())
    on conflict (user_id) do update set
      group_id = excluded.group_id,
      source = excluded.source,
      updated_by = auth.uid();
  end if;
  perform public.audit('user.assign_group', 'user:' || p_user_id,
    jsonb_build_object('before_group_id', v_before, 'after_group_id', p_group_id));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fn_assign_gm_station(
  p_user_id uuid,
  p_day smallint,
  p_station_id integer
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_before integer;
begin
  if not public.is_admin() then raise exception 'PERMISSION_DENIED'; end if;
  if p_day not in (1, 2) then raise exception 'INVALID_DAY'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id and role = 'gm') then
    raise exception 'USER_NOT_FOUND';
  end if;
  select station_id into v_before from public.gm_station_assignments
    where user_id = p_user_id and day = p_day;
  if p_station_id is null then
    delete from public.gm_station_assignments where user_id = p_user_id and day = p_day;
  else
    insert into public.gm_station_assignments
      (user_id, day, station_id, created_by, updated_by)
    values (p_user_id, p_day, p_station_id, auth.uid(), auth.uid())
    on conflict (user_id, day) do update set
      station_id = excluded.station_id,
      updated_by = auth.uid();
  end if;
  perform public.audit('user.assign_gm_station', 'user:' || p_user_id,
    jsonb_build_object('day', p_day, 'before_station_id', v_before,
                       'after_station_id', p_station_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- Preserve the existing Admin screen's combined editor while routing its
-- allocation fields through the canonical assignment interfaces. A legacy
-- station value is applied to both days until Section 4 adds separate inputs.
create or replace function public.fn_admin_update_profile(
  p_user_id uuid,
  p_role public.user_role,
  p_group_id integer,
  p_station_id integer
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_before jsonb;
begin
  if not public.is_admin() then raise exception 'PERMISSION_DENIED'; end if;
  if p_role not in ('freshie', 'faci', 'gm', 'admin') then
    raise exception 'INVALID_ROLE';
  end if;

  select jsonb_build_object('role', role, 'group_id', group_id,
                            'station_id', station_id)
    into v_before from public.profiles where id = p_user_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;

  update public.profiles
     set role = p_role,
         group_id = case when p_role in ('freshie', 'faci') then p_group_id end,
         station_id = case when p_role = 'gm' then p_station_id end,
         admin_team = case when p_role = 'admin' then admin_team end
   where id = p_user_id;

  if p_role in ('freshie', 'faci') and p_group_id is not null then
    insert into public.user_group_assignments
      (user_id, group_id, source, created_by, updated_by)
    values (p_user_id, p_group_id, 'admin', auth.uid(), auth.uid())
    on conflict (user_id) do update set
      group_id = excluded.group_id, source = excluded.source,
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
      station_id = excluded.station_id, updated_by = auth.uid();
  else
    delete from public.gm_station_assignments where user_id = p_user_id;
  end if;

  perform public.audit('user.update', 'user:' || p_user_id,
    jsonb_build_object(
      'before', v_before,
      'after', jsonb_build_object('role', p_role, 'group_id', p_group_id,
                                  'station_id', p_station_id)
    ));
  return jsonb_build_object('ok', true);
end;
$$;

alter publication supabase_realtime add table
  public.user_group_assignments,
  public.gm_station_assignments;
