-- Migration 0095: Station check-in is Game Master only (removed from Faci).
--
-- Only Game Masters (gm, guardian_gm) and game leads (admin, hogm) can check
-- groups in or out at a station. Faci can no longer check in.
-- Game Masters can only check in at their assigned station; Admin and HOGM
-- can check in at any station.
-- The Game Master specifies which group (p_group_id) is arriving or leaving.

-- 1. Update fn_manual_checkin
drop function if exists public.fn_manual_checkin(integer, double precision, double precision, double precision);

create or replace function public.fn_manual_checkin(
  p_station_id integer,
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_accuracy   double precision default null,
  p_group_id   integer default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_role  public.user_role := public.my_role();
  v_group integer := coalesce(p_group_id, public.my_group_id());
  v_st    public.stations%rowtype;
  v_prev  integer;
  v_own   integer;
  v_dist  double precision;
  v_bdist double precision;
  v_slack double precision := least(greatest(coalesce(p_accuracy, 0), 0), 100);
  v_far   boolean := false;
  v_b     record;
begin
  if v_role = 'faci' then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not (v_role in ('admin', 'hogm', 'gm', 'guardian_gm')) then
    raise exception 'PERMISSION_DENIED';
  end if;

  if v_role in ('gm', 'guardian_gm') then
    select station_id into v_own from public.profiles where id = auth.uid();
    if v_own is distinct from p_station_id then
      raise exception 'NOT_YOUR_STATION';
    end if;
  end if;

  if v_group is null then
    raise exception 'SELECT_GROUP';
  end if;
  if not exists (select 1 from public.groups where id = v_group) then
    raise exception 'GROUP_NOT_FOUND';
  end if;

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

  if p_lat is not null and p_lng is not null then
    -- Distance to the station's own point, if it has one.
    if v_st.lat is not null and v_st.lng is not null then
      v_dist := 2 * 6371000 * asin(sqrt(
        power(sin(radians(p_lat - v_st.lat) / 2), 2)
        + cos(radians(v_st.lat)) * cos(radians(p_lat))
          * power(sin(radians(p_lng - v_st.lng) / 2), 2)
      ));
    end if;

    -- Distance to the whole building, if it is a known one.
    select * into v_b from public.building_geofence(v_st.area);
    if found then
      v_bdist := 2 * 6371000 * asin(sqrt(
        power(sin(radians(p_lat - v_b.lat) / 2), 2)
        + cos(radians(v_b.lat)) * cos(radians(p_lat))
          * power(sin(radians(p_lng - v_b.lng) / 2), 2)
      ));
    end if;

    if v_dist is not null or v_bdist is not null then
      v_far := not (
        (v_dist is not null
          and v_dist - v_slack <= coalesce(v_st.radius_m, 100))
        or (v_bdist is not null
          and v_bdist - v_slack <= v_b.radius_m)
      );
    end if;
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

  perform public.audit('station.checkin', 'group:' || v_group,
    jsonb_build_object('station_id', p_station_id, 'station_name', v_st.name));

  return jsonb_build_object(
    'ok', true,
    'far_away', v_far,
    'distance_m', case when v_dist is null then null else round(v_dist) end,
    'group_id', v_group
  );
end;
$$;

grant execute on function public.fn_manual_checkin(integer, double precision, double precision, double precision, integer)
  to authenticated;

-- 2. Update fn_uncheckin
drop function if exists public.fn_uncheckin();

create or replace function public.fn_uncheckin(p_group_id integer default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_role    public.user_role := public.my_role();
  v_group   integer := coalesce(p_group_id, public.my_group_id());
  v_station integer;
  v_own     integer;
begin
  if v_role = 'faci' then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not (v_role in ('admin', 'hogm', 'gm', 'guardian_gm')) then
    raise exception 'PERMISSION_DENIED';
  end if;

  if v_group is null then
    raise exception 'SELECT_GROUP';
  end if;

  select station_id into v_station
    from public.station_occupancy
   where group_id = v_group;

  if v_station is null then
    raise exception 'NOT_CHECKED_IN';
  end if;

  if v_role in ('gm', 'guardian_gm') then
    select station_id into v_own from public.profiles where id = auth.uid();
    if v_own is distinct from v_station then
      raise exception 'NOT_YOUR_STATION';
    end if;
  end if;

  delete from public.station_occupancy
   where group_id = v_group;

  perform public.fn_refresh_station(v_station);
  perform public.audit('station.uncheckin', 'group:' || v_group,
    jsonb_build_object('station_id', v_station));
  return jsonb_build_object('ok', true, 'group_id', v_group, 'station_id', v_station);
end;
$$;

grant execute on function public.fn_uncheckin(integer) to authenticated;

-- 3. RLS on station_occupancy: GMs and staff can read who is at stations
drop policy if exists "gm reads occupancy" on public.station_occupancy;
create policy "gm reads occupancy" on public.station_occupancy
  for select using (
    public.my_role() in ('gm', 'guardian_gm', 'hogm', 'admin', 'hof', 'committee')
  );

-- 4. Helper to list occupants of a station
create or replace function public.fn_station_occupants(p_station_id integer)
returns table (group_id integer, group_name text, checked_in_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select so.group_id, g.name, so.checked_in_at
    from public.station_occupancy so
    join public.groups g on g.id = so.group_id
   where so.station_id = p_station_id
   order by so.checked_in_at asc;
$$;

grant execute on function public.fn_station_occupants(integer) to authenticated;
