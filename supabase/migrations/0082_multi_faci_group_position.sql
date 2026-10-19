-- Migration 0082: three Facis per group, and the courts on the map.
--
-- A. Tennis Court and Volleyball Court become map buildings: stations can be
--    placed there, and check-in uses their geofence. "TBD" stays allowed for
--    the placeholder stations (supabase/seeds/placeholder_stations.sql).
-- B. fn_report_gps:
--    * ignores a report sent less than 10 s after the same Faci's last one
--      (a phone whose reports keep failing could otherwise send one a second);
--    * cleanup keeps each Faci's newest fix, so a group that goes quiet still
--      has a "last seen" position. Older fixes are deleted after one hour.
--    * a non-finite or negative accuracy is stored as NULL.
-- C. fn_group_positions(): one row per visible group, with the best GPS fix
--    across all of its Facis' phones and its current station check-in. The map
--    picks which one to draw (src/lib/groupPosition.ts). Committee tier sees
--    every group, a Faci sees their own. Groups with no report are included,
--    so the map can list them as "not seen".
-- D. fn_group_faci_status(group): each Faci in a group and when their phone
--    last reported. Committee tier sees any group and the phone numbers; a
--    Faci sees their own group without phone numbers.

-- ── A. Courts ─────────────────────────────────────────────────────────

alter table public.stations drop constraint if exists stations_area_building;
alter table public.stations
  add constraint stations_area_building
  check (area in ('A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'Track & Field',
                  'Tennis Court', 'Volleyball Court', 'TBD'));

-- Same points as GPS_POINTS in src/lib/mapGeo.ts.
create or replace function public.building_geofence(p_area text)
returns table (lat double precision, lng double precision, radius_m integer)
language sql immutable
as $$
  select b.lat, b.lng, b.radius_m
    from (values
      ('A1',               2.830716513626805::double precision, 101.70238566331372::double precision, 90),
      ('A2',               2.830894481771187, 101.70300445323068, 90),
      ('A3',               2.831185702312712, 101.70377875057042, 90),
      ('A4',               2.831229385384772, 101.70461460291834, 90),
      ('A5',               2.8310562554223995, 101.70528647466466, 90),
      ('B1',               2.8326752117750265, 101.70648314368725, 140),
      ('Track & Field',    2.8303729712091497, 101.7068105515868, 130),
      ('Tennis Court',     2.831869036722138, 101.70667501669327, 45),
      ('Volleyball Court', 2.831858794362992, 101.7072533920544, 45)
    ) as b(area, lat, lng, radius_m)
   where b.area = p_area;
$$;

-- ── B. fn_report_gps ──────────────────────────────────────────────────

create or replace function public.fn_report_gps(
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_group    integer := public.my_group_id();
  v_accuracy double precision := p_accuracy;
  v_last     timestamptz;
begin
  if public.my_role() <> 'faci' then
    raise exception 'PERMISSION_DENIED';
  end if;
  if v_group is null then
    raise exception 'NOT_IN_GROUP';
  end if;
  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'INVALID_POSITION';
  end if;
  if v_accuracy is not null
     and (v_accuracy < 0 or v_accuracy in ('NaN', 'Infinity')) then
    v_accuracy := null;
  end if;

  select max(created_at) into v_last
    from public.group_locations
   where group_id = v_group and source = 'gps' and reported_by = auth.uid();
  if v_last > now() - interval '10 seconds' then
    return jsonb_build_object('ok', true, 'throttled', true);
  end if;

  insert into public.group_locations (group_id, source, lat, lng, accuracy_m, reported_by)
  values (v_group, 'gps', p_lat, p_lng, v_accuracy, auth.uid());

  -- Keep each Faci's newest fix; drop the rest once they are an hour old.
  delete from public.group_locations gl
   where gl.group_id = v_group
     and gl.source = 'gps'
     and gl.created_at < now() - interval '1 hour'
     and gl.id <> (
       select max(x.id) from public.group_locations x
        where x.group_id = v_group
          and x.source = 'gps'
          and x.reported_by is not distinct from gl.reported_by
     );

  return jsonb_build_object('ok', true);
end;
$$;

-- ── C. fn_group_positions ─────────────────────────────────────────────

create or replace function public.fn_group_positions()
returns table (
  group_id integer,
  group_name text,
  gps_lat double precision,
  gps_lng double precision,
  gps_accuracy_m double precision,
  gps_at timestamptz,
  facis_reporting integer,
  facis_total integer,
  checkin_station_id integer,
  checkin_station_code text,
  checkin_station_name text,
  checkin_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  with visible as (
    select g.id, g.name
      from public.groups g
     where public.is_committee() or g.id = public.my_group_id()
  ),
  -- Newest fix from each Faci's phone.
  per_faci as (
    select distinct on (gl.group_id, gl.reported_by)
           gl.group_id, gl.lat, gl.lng, gl.accuracy_m, gl.created_at
      from public.group_locations gl
      join visible v on v.id = gl.group_id
     where gl.source = 'gps'
       and gl.created_at > now() - interval '12 hours'
     order by gl.group_id, gl.reported_by, gl.created_at desc
  ),
  -- Best fix across the phones: smallest accuracy plus 1 m per second of age
  -- (walking pace), so a precise fix wins until it is too old to trust.
  best as (
    select distinct on (pf.group_id) pf.*
      from per_faci pf
     order by pf.group_id,
              coalesce(pf.accuracy_m, 500)
                + extract(epoch from now() - pf.created_at),
              pf.created_at desc
  ),
  reporting as (
    select pf.group_id, count(*)::integer as n
      from per_faci pf
     where pf.created_at > now() - interval '2 minutes'
     group by pf.group_id
  ),
  facis as (
    select p.group_id, count(*)::integer as n
      from public.profiles p
     where p.role = 'faci' and p.group_id is not null
     group by p.group_id
  )
  select v.id, v.name,
         b.lat, b.lng, b.accuracy_m, b.created_at,
         coalesce(r.n, 0), coalesce(f.n, 0),
         so.station_id, s.code, s.name, so.checked_in_at
    from visible v
    left join best b on b.group_id = v.id
    left join reporting r on r.group_id = v.id
    left join facis f on f.group_id = v.id
    left join public.station_occupancy so on so.group_id = v.id
    left join public.stations s on s.id = so.station_id
   order by v.id;
$$;

revoke all on function public.fn_group_positions() from public, anon;
grant execute on function public.fn_group_positions() to authenticated;

-- ── D. fn_group_faci_status ───────────────────────────────────────────

create or replace function public.fn_group_faci_status(p_group_id integer)
returns table (
  user_id uuid,
  full_name text,
  phone text,
  last_gps_at timestamptz,
  last_accuracy_m double precision
)
language sql stable security definer set search_path = public
as $$
  select p.id,
         p.full_name,
         case when public.is_committee() then p.phone end,
         last.created_at,
         last.accuracy_m
    from public.profiles p
    left join lateral (
      select gl.created_at, gl.accuracy_m
        from public.group_locations gl
       where gl.group_id = p_group_id
         and gl.source = 'gps'
         and gl.reported_by = p.id
       order by gl.created_at desc
       limit 1
    ) last on true
   where p.role = 'faci'
     and p.group_id = p_group_id
     and (public.is_committee() or p_group_id = public.my_group_id())
   order by p.full_name;
$$;

revoke all on function public.fn_group_faci_status(integer) from public, anon;
grant execute on function public.fn_group_faci_status(integer) to authenticated;
