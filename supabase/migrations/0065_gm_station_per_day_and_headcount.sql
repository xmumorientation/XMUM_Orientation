-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0065: Game Master assignment per day, and one headcount per group
--
-- A. Game Master assignment (managed on Admin → Stations)
--    * gm_station_assignments (user_id, day, station_id; one row per GM per
--      day) is the source of truth. 0043 already writes to it, so it is
--      created here only if it does not exist yet.
--    * A station may have many GMs; a GM has at most one station per day.
--    * profiles.station_id stays, because the GM game functions read it. It is
--      now the GM's CURRENT station: the assignment for the running day
--      (Day 2 once Day 1 has ended or Day 2 has started), else the other
--      day's. A trigger keeps it in sync when assignments or phases change.
--    * Anything that still writes profiles.station_id (user create, CSV
--      import, seeding) is copied into gm_station_assignments by a trigger.
--    * fn_admin_update_profile no longer touches station assignments (it used
--      to copy one station to BOTH days). Changing a user away from a GM role
--      removes that user's assignments.
--
-- B. Headcount: one number per group, no sessions (group_headcounts).
--    Admin / Faci / HOF can set it at any time; Admin can clear it. Every
--    change is written to the audit log. attendance_headcounts and
--    attendance_sessions are left untouched; the latest headcount per group
--    is copied over.
-- ═══════════════════════════════════════════════════════════════════════

-- ── A1. Assignment table (no-op when it already exists) ────────────────

create table if not exists public.gm_station_assignments (
  user_id    uuid    not null references public.profiles (id) on delete cascade,
  day        integer not null check (day in (1, 2)),
  station_id integer not null references public.stations (id) on delete cascade,
  created_by uuid,
  updated_by uuid,
  primary key (user_id, day)
);

alter table public.gm_station_assignments enable row level security;

-- Stations delete cleanly even if the table was created without ON DELETE CASCADE.
create or replace function public.trg_station_delete_assignments()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  delete from public.gm_station_assignments where station_id = old.id;
  return old;
end;
$$;
drop trigger if exists station_delete_assignments on public.stations;
create trigger station_delete_assignments
  before delete on public.stations
  for each row execute function public.trg_station_delete_assignments();

-- A station that changes day takes its GMs along (fails, changing nothing,
-- if a GM already has another station on the new day).
create or replace function public.trg_station_day_assignments()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  update public.gm_station_assignments set day = new.day where station_id = new.id;
  return new;
end;
$$;
drop trigger if exists station_day_assignments on public.stations;
create trigger station_day_assignments
  after update of day on public.stations
  for each row when (old.day is distinct from new.day)
  execute function public.trg_station_day_assignments();

-- ── A2. Backfill from profiles.station_id (keeps existing assignments) ──

insert into public.gm_station_assignments (user_id, day, station_id, created_by, updated_by)
select p.id, s.day, s.id,
       (select a.id from public.profiles a where a.role = 'admin' order by a.created_at limit 1),
       (select a.id from public.profiles a where a.role = 'admin' order by a.created_at limit 1)
  from public.profiles p
  join public.stations s on s.id = p.station_id
on conflict (user_id, day) do nothing;

-- ── A3. profiles.station_id = the GM's current station ─────────────────

create or replace function public.fn_gm_current_day()
returns integer
language sql stable security definer set search_path = public
as $$
  select case
    when exists (select 1 from public.phases where key = 'day2' and state in ('active', 'paused', 'ended'))
      or exists (select 1 from public.phases where key = 'day1' and state = 'ended')
    then 2 else 1 end;
$$;

create or replace function public.fn_sync_gm_current_station(p_user uuid default null)
returns void
language sql security definer set search_path = public
as $$
  update public.profiles p
     set station_id = x.sid
    from (
      select pr.id,
             (select a.station_id
                from public.gm_station_assignments a
               where a.user_id = pr.id
               order by (a.day = public.fn_gm_current_day()) desc, a.day
               limit 1) as sid
        from public.profiles pr
       where p_user is null or pr.id = p_user
    ) x
   where p.id = x.id
     and p.station_id is distinct from x.sid;
$$;

create or replace function public.trg_assignment_sync()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  perform public.fn_sync_gm_current_station(coalesce(new.user_id, old.user_id));
  return null;
end;
$$;
drop trigger if exists assignment_sync on public.gm_station_assignments;
create trigger assignment_sync
  after insert or update or delete on public.gm_station_assignments
  for each row execute function public.trg_assignment_sync();

create or replace function public.trg_phase_sync()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  perform public.fn_sync_gm_current_station(null);
  return null;
end;
$$;
drop trigger if exists phase_sync on public.phases;
create trigger phase_sync
  after update of state on public.phases
  for each statement execute function public.trg_phase_sync();

-- Writers that still set profiles.station_id directly (create, import, seed).
create or replace function public.trg_profile_station_to_assignment()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.gm_station_assignments (user_id, day, station_id, created_by, updated_by)
  select new.id, s.day, s.id, auth.uid(), auth.uid()
    from public.stations s
   where s.id = new.station_id
  on conflict (user_id, day) do update
    set station_id = excluded.station_id, updated_by = auth.uid()
    where public.gm_station_assignments.station_id is distinct from excluded.station_id;
  return null;
end;
$$;
drop trigger if exists profile_station_to_assignment on public.profiles;
drop trigger if exists profile_station_to_assignment_ins on public.profiles;
create trigger profile_station_to_assignment_ins
  after insert on public.profiles
  for each row when (new.station_id is not null)
  execute function public.trg_profile_station_to_assignment();
create trigger profile_station_to_assignment
  after update of station_id on public.profiles
  for each row when (new.station_id is not null and old.station_id is distinct from new.station_id)
  execute function public.trg_profile_station_to_assignment();

-- ── A4. Admin RPCs for Admin → Stations ────────────────────────────────

create or replace function public.fn_admin_station_gms()
returns table (user_id uuid, station_id integer, day integer)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  return query
    select a.user_id, a.station_id, a.day from public.gm_station_assignments a;
end;
$$;

create or replace function public.fn_admin_assign_station_gm(p_station_id integer, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_station public.stations%rowtype;
  v_role public.user_role;
  v_prev integer;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  select * into v_station from public.stations where id = p_station_id;
  if not found then
    raise exception 'STATION_NOT_FOUND';
  end if;
  select role into v_role from public.profiles where id = p_user_id;
  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;
  if v_role not in ('gm', 'guardian_gm') then
    raise exception 'NOT_A_GAME_MASTER';
  end if;

  select station_id into v_prev from public.gm_station_assignments
   where user_id = p_user_id and day = v_station.day;

  insert into public.gm_station_assignments (user_id, day, station_id, created_by, updated_by)
  values (p_user_id, v_station.day, p_station_id, auth.uid(), auth.uid())
  on conflict (user_id, day) do update
    set station_id = excluded.station_id, updated_by = auth.uid();

  perform public.audit('station.gm_assign', 'user:' || p_user_id,
    jsonb_build_object('station_id', p_station_id, 'day', v_station.day, 'previous_station_id', v_prev));
  return jsonb_build_object('ok', true, 'previous_station_id', v_prev);
end;
$$;

create or replace function public.fn_admin_unassign_station_gm(p_station_id integer, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  delete from public.gm_station_assignments
   where user_id = p_user_id and station_id = p_station_id;
  perform public.audit('station.gm_unassign', 'user:' || p_user_id,
    jsonb_build_object('station_id', p_station_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- ── A5. Users page no longer manages stations ──────────────────────────
-- Same signature as 0043 (p_station_id is ignored). Assignments are managed
-- on Admin → Stations; a user who stops being a GM loses theirs.

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

  select jsonb_build_object('role', role, 'group_id', group_id, 'station_id', station_id)
    into v_before
    from public.profiles
   where id = p_user_id;
  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  update public.profiles
     set role = p_role,
         group_id = case when p_role in ('freshie', 'faci') then p_group_id end,
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

  if p_role not in ('gm', 'guardian_gm') then
    delete from public.gm_station_assignments where user_id = p_user_id;
  end if;

  perform public.audit(
    'user.update',
    'user:' || p_user_id,
    jsonb_build_object(
      'before', v_before,
      'after', jsonb_build_object('role', p_role, 'group_id', p_group_id)
    )
  );
  return jsonb_build_object('ok', true);
end;
$$;

-- ── B. One headcount per group ─────────────────────────────────────────

create table if not exists public.group_headcounts (
  group_id   integer primary key references public.groups (id) on delete cascade,
  headcount  integer not null check (headcount >= 0),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.group_headcounts enable row level security;

drop policy if exists "faci reads own group headcount" on public.group_headcounts;
create policy "faci reads own group headcount" on public.group_headcounts
  for select using (public.my_role() = 'faci' and group_id = public.my_group_id());

drop policy if exists "committee reads all group headcounts" on public.group_headcounts;
create policy "committee reads all group headcounts" on public.group_headcounts
  for select using (public.is_committee());

-- Keep what was already counted: the latest headcount per group.
insert into public.group_headcounts (group_id, headcount, updated_by, updated_at)
select distinct on (h.group_id) h.group_id, h.headcount, h.marked_by, h.marked_at
  from public.attendance_headcounts h
 order by h.group_id, h.marked_at desc
on conflict (group_id) do nothing;

create or replace function public.fn_set_headcount(p_count integer, p_group_id integer default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.user_role := public.my_role();
  v_group integer;
  v_before integer;
begin
  if v_role not in ('faci', 'hof', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_count is null or p_count < 0 then
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

  select headcount into v_before from public.group_headcounts where group_id = v_group;

  insert into public.group_headcounts (group_id, headcount, updated_by, updated_at)
  values (v_group, p_count, auth.uid(), now())
  on conflict (group_id) do update
    set headcount = excluded.headcount, updated_by = excluded.updated_by, updated_at = now();

  perform public.audit('headcount.set', 'group:' || v_group,
    jsonb_build_object('before', v_before, 'after', p_count));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fn_clear_headcount(p_group_id integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_before integer;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  delete from public.group_headcounts where group_id = p_group_id returning headcount into v_before;
  perform public.audit('headcount.clear', 'group:' || p_group_id,
    jsonb_build_object('before', v_before));
  return jsonb_build_object('ok', true);
end;
$$;

do $$ begin alter publication supabase_realtime add table public.group_headcounts; exception when others then null; end $$;
