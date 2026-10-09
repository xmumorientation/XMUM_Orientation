-- Station capacity and automatic status.
--
-- * Each station has max_groups. When that many groups are checked in, the
--   station becomes "in_progress"; below that it is "available".
-- * An admin or GM can force "in_progress" (status_override). Clearing the
--   station resets it to automatic.
-- * "closed" is always manual and is never changed automatically.
-- * A group is at one station at a time. Checking in elsewhere moves it. A
--   Faci can uncheck their own group. A GM or admin can clear a station.
-- * Check-in can carry the Faci's GPS position. If the station has a
--   location and the Faci is outside its radius, the call succeeds but
--   returns far_away = true so the app can warn.

alter table public.stations
  add column if not exists max_groups      integer check (max_groups is null or max_groups > 0),
  add column if not exists lat             double precision,
  add column if not exists lng             double precision,
  add column if not exists radius_m        integer check (radius_m is null or radius_m > 0),
  add column if not exists status_override boolean not null default false;

-- One row per group that is currently at a station.
create table if not exists public.station_occupancy (
  group_id      integer primary key references public.groups (id) on delete cascade,
  station_id    integer not null references public.stations (id) on delete cascade,
  checked_in_by uuid references public.profiles (id),
  checked_in_at timestamptz not null default now(),
  lat           double precision,
  lng           double precision,
  accuracy_m    double precision
);

create index if not exists station_occupancy_station_idx
  on public.station_occupancy (station_id);

alter table public.station_occupancy enable row level security;

drop policy if exists "committee reads occupancy" on public.station_occupancy;
create policy "committee reads occupancy" on public.station_occupancy
  for select using (public.is_committee());

drop policy if exists "faci reads own occupancy" on public.station_occupancy;
create policy "faci reads own occupancy" on public.station_occupancy
  for select using (group_id = public.my_group_id());

do $$ begin
  alter publication supabase_realtime add table public.station_occupancy;
exception when others then null; end $$;

-- ── Status recompute (internal, not callable from the app) ───────────────

create or replace function public.fn_refresh_station(p_station_id integer)
returns void
language sql security definer set search_path = public
as $$
  update public.stations s
     set status = case
       when (select count(*) from public.station_occupancy o where o.station_id = s.id)
            >= s.max_groups
       then 'in_progress'::public.station_status
       else 'available'::public.station_status
     end
   where s.id = p_station_id
     and s.max_groups is not null
     and not s.status_override
     and s.status <> 'closed';
$$;

revoke all on function public.fn_refresh_station(integer) from public, anon, authenticated;

-- Recompute when an admin sets or changes the capacity.
create or replace function public.stations_capacity_changed()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.fn_refresh_station(new.id);
  return null;
end;
$$;

drop trigger if exists stations_capacity_changed on public.stations;
create trigger stations_capacity_changed
  after insert or update of max_groups on public.stations
  for each row
  execute function public.stations_capacity_changed();

-- ── Check in ─────────────────────────────────────────────────────────────

drop function if exists public.fn_manual_checkin(integer);

create or replace function public.fn_manual_checkin(
  p_station_id integer,
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_accuracy   double precision default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_group integer := public.my_group_id();
  v_st    public.stations%rowtype;
  v_prev  integer;
  v_dist  double precision;
  v_far   boolean := false;
begin
  if public.my_role() not in ('faci', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if v_group is null then
    raise exception 'NOT_IN_GROUP';
  end if;

  -- Lock the station so two groups cannot take the last slot at once.
  select * into v_st from public.stations where id = p_station_id for update;
  if not found then raise exception 'STATION_NOT_FOUND'; end if;
  if v_st.status = 'closed' then raise exception 'STATION_CLOSED'; end if;

  select station_id into v_prev
    from public.station_occupancy where group_id = v_group;

  if v_prev is distinct from p_station_id
     and v_st.max_groups is not null
     and (select count(*) from public.station_occupancy
           where station_id = p_station_id) >= v_st.max_groups then
    raise exception 'STATION_FULL';
  end if;

  if p_lat is not null and p_lng is not null
     and v_st.lat is not null and v_st.lng is not null then
    v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat - v_st.lat) / 2), 2)
      + cos(radians(v_st.lat)) * cos(radians(p_lat))
        * power(sin(radians(p_lng - v_st.lng) / 2), 2)
    ));
    v_far := v_dist > coalesce(v_st.radius_m, 100);
  end if;

  insert into public.station_occupancy
    (group_id, station_id, checked_in_by, checked_in_at, lat, lng, accuracy_m)
  values
    (v_group, p_station_id, auth.uid(), now(), p_lat, p_lng, p_accuracy)
  on conflict (group_id) do update
    set station_id    = excluded.station_id,
        checked_in_by = excluded.checked_in_by,
        checked_in_at = excluded.checked_in_at,
        lat           = excluded.lat,
        lng           = excluded.lng,
        accuracy_m    = excluded.accuracy_m;

  insert into public.group_locations (group_id, source, station_id, reported_by)
  values (v_group, 'manual', p_station_id, auth.uid());

  perform public.fn_refresh_station(p_station_id);
  if v_prev is not null and v_prev <> p_station_id then
    perform public.fn_refresh_station(v_prev);
  end if;

  return jsonb_build_object(
    'ok', true,
    'far_away', v_far,
    'distance_m', case when v_dist is null then null else round(v_dist) end
  );
end;
$$;

grant execute on function public.fn_manual_checkin(integer, double precision, double precision, double precision)
  to authenticated;

-- ── Uncheck (Faci removes their own group from its station) ──────────────

create or replace function public.fn_uncheckin()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_group   integer := public.my_group_id();
  v_station integer;
begin
  if public.my_role() not in ('faci', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if v_group is null then
    raise exception 'NOT_IN_GROUP';
  end if;

  delete from public.station_occupancy
   where group_id = v_group
  returning station_id into v_station;

  if v_station is null then raise exception 'NOT_CHECKED_IN'; end if;

  perform public.fn_refresh_station(v_station);
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.fn_uncheckin() to authenticated;

-- ── Clear a station (GM / admin) ─────────────────────────────────────────

create or replace function public.fn_clear_station(p_station_id integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.user_role := public.my_role();
  v_own  integer;
begin
  if v_role in ('hof', 'hogm', 'admin') then
    null;
  elsif v_role in ('gm', 'guardian_gm') then
    select station_id into v_own from public.profiles where id = auth.uid();
    if v_own is distinct from p_station_id then
      raise exception 'NOT_YOUR_STATION';
    end if;
  else
    raise exception 'PERMISSION_DENIED';
  end if;

  perform 1 from public.stations where id = p_station_id for update;
  if not found then raise exception 'STATION_NOT_FOUND'; end if;

  delete from public.station_occupancy where station_id = p_station_id;
  update public.stations set status_override = false where id = p_station_id;
  perform public.fn_refresh_station(p_station_id);

  perform public.audit('station.clear', 'station:' || p_station_id, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.fn_clear_station(integer) to authenticated;

-- ── Manual status (GM / admin) ───────────────────────────────────────────
-- in_progress  = manual override (stays until the station is cleared or set
--                back to available)
-- available    = back to automatic
-- closed       = closed by hand

create or replace function public.fn_set_station_status(
  p_station_id integer,
  p_status public.station_status
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.user_role := public.my_role();
  v_own integer;
begin
  if v_role in ('hof', 'hogm', 'admin') then
    null;
  elsif v_role in ('gm', 'guardian_gm') then
    select station_id into v_own from public.profiles where id = auth.uid();
    if v_own is distinct from p_station_id then
      raise exception 'NOT_YOUR_STATION';
    end if;
  else
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.stations
     set status = p_status,
         status_override = (p_status = 'in_progress')
   where id = p_station_id;
  if not found then raise exception 'STATION_NOT_FOUND'; end if;

  if p_status = 'available' then
    perform public.fn_refresh_station(p_station_id);
  end if;

  perform public.audit('station.status', 'station:' || p_station_id,
    jsonb_build_object('status', p_status));
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Counts for the UI ────────────────────────────────────────────────────

create or replace function public.fn_station_group_counts()
returns table (station_id integer, group_count integer)
language sql stable security definer set search_path = public
as $$
  select o.station_id, count(*)::integer
    from public.station_occupancy o
   where auth.uid() is not null
   group by o.station_id;
$$;

grant execute on function public.fn_station_group_counts() to authenticated;

-- The station the caller's own group is checked in at (null if none).
create or replace function public.fn_my_station()
returns integer
language sql stable security definer set search_path = public
as $$
  select station_id from public.station_occupancy
   where group_id = public.my_group_id();
$$;

grant execute on function public.fn_my_station() to authenticated;

-- ── Map pins follow occupancy ────────────────────────────────────────────
-- A manual check-in only counts while the group is still at that station.

create or replace function public.fn_latest_locations()
returns table (
  group_id integer, group_name text, source public.location_source,
  station_id integer, station_name text, lat double precision, lng double precision,
  accuracy_m double precision, reported_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select distinct on (gl.group_id)
         gl.group_id, g.name, gl.source, gl.station_id, s.name,
         gl.lat, gl.lng, gl.accuracy_m, gl.created_at
    from public.group_locations gl
    join public.groups g on g.id = gl.group_id
    left join public.stations s on s.id = gl.station_id
   where (public.is_committee() or gl.group_id = public.my_group_id())
     and (
       gl.source <> 'manual'
       or exists (
         select 1 from public.station_occupancy o
          where o.group_id = gl.group_id and o.station_id = gl.station_id
       )
     )
   order by gl.group_id, gl.created_at desc;
$$;
