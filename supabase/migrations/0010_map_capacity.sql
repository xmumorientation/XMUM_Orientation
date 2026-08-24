-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0010: Map capacity & public occupancy
-- Adds Day 1 PK station flag, relaxes manual check-in constraint,
-- and exposes a privacy-safe occupancy RPC for Freshies.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Add is_pk_day1 flag to stations.
--    PK Day 1 stations host 2 competing groups simultaneously.
alter table public.stations
  add column if not exists is_pk_day1 boolean not null default false;

-- 2. Relax group_locations_check: allow manual records with station_id = NULL.
--    NULL station_id represents a group checking out / leaving a station
--    without specifying a new destination (used by the map page "Update
--    Location" flow when a faci wants to clear their position).
alter table public.group_locations
  drop constraint if exists group_locations_check;

alter table public.group_locations
  add constraint group_locations_check check (
    (source = 'gps' and lat is not null and lng is not null)
    or (source = 'manual')
  );

-- 3. Public station occupancy — privacy-safe for Freshies.
--    Returns (station_id, occupancy_count) for groups whose LATEST
--    manual check-in is at that station and within the last 10 minutes.
--    No group names or IDs are exposed — Freshies see counts only.
create or replace function public.fn_public_station_occupancy()
returns table (station_id integer, occupancy_count bigint)
language sql stable security definer set search_path = public
as $$
  select latest.station_id, count(*) as occupancy_count
  from (
    select distinct on (gl.group_id)
           gl.station_id,
           gl.source,
           gl.created_at
    from public.group_locations gl
    order by gl.group_id, gl.created_at desc
  ) latest
  where latest.source = 'manual'
    and latest.station_id is not null
    and latest.created_at > now() - interval '10 minutes'
  group by latest.station_id;
$$;

-- 4. Update fn_manual_checkin to accept NULL station_id (checkout).
--    NULL means the group is leaving without specifying a new station.
--    The relaxed constraint above allows this insert to succeed.
create or replace function public.fn_manual_checkin(p_station_id integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_group integer := public.my_group_id();
begin
  if public.my_role() not in ('faci', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if v_group is null then
    raise exception 'NOT_IN_GROUP';
  end if;

  insert into public.group_locations (group_id, source, station_id, reported_by)
  values (v_group, 'manual', p_station_id, auth.uid());

  return jsonb_build_object('ok', true);
end;
$$;