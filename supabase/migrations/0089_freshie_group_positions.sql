-- Migration 0089: Freshies and Facis see every group's location on the map.
--
-- The group pins on the map are public to Freshies and Facis (Ben,
-- 2026-10-19): they see where every group's Facis are, as Committee does.
-- Only fn_group_positions() changes; the body is 0082's with one more line
-- in `visible`.
--
-- The raw group_locations table keeps its policies (0002): a Freshie or Faci
-- reads only their own group's rows, so Realtime brings them only their own
-- group's reports. The map reloads every group's pins every 10 s anyway.

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
     where public.is_committee()
        or public.my_role() in ('freshie', 'faci')
        or g.id = public.my_group_id()
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
