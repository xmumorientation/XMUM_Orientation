-- Migration 0110: index for "newest GPS fix per Faci phone".
--
-- fn_group_positions() (0108) runs on every open map every 10 s and after
-- each new fix. Its per_faci step is
--   distinct on (group_id, reported_by) ... where source = 'gps'
--   order by group_id, reported_by, created_at desc
-- and the only index was (group_id, created_at desc), so each call read and
-- sorted every GPS row of the last hour. The same lookup (one Faci's newest
-- fix) is in fn_report_gps (throttle check and pruning, 0082) and in
-- fn_group_faci_status (0108). This index matches all three, so they become
-- index scans with no sort.
--
-- fn_group_positions() also gets a new per_faci step: it lists the (group,
-- phone) pairs by skipping through the index, then reads each phone's newest
-- fix, instead of walking every fix of the last hour. Same rows out. The rest
-- of the body is 0108's, unchanged; change this version from now on.
--
-- No data changes. Safe to run again.

create index if not exists group_locations_gps_per_faci_idx
  on public.group_locations (group_id, reported_by, created_at desc)
  where source = 'gps';

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
  with recursive visible as (
    select g.id, g.name
      from public.groups g
     where auth.uid() is not null
  ),
  -- Every (group, phone) pair with a GPS fix, found by skipping through the
  -- index one pair at a time instead of reading every fix.
  phones as (
    (select gl.group_id, gl.reported_by
       from public.group_locations gl
      where gl.source = 'gps' and gl.reported_by is not null
      order by gl.group_id, gl.reported_by
      limit 1)
    union all
    select nxt.group_id, nxt.reported_by
      from phones ph
     cross join lateral (
       select gl.group_id, gl.reported_by
         from public.group_locations gl
        where gl.source = 'gps' and gl.reported_by is not null
          and (gl.group_id, gl.reported_by) > (ph.group_id, ph.reported_by)
        order by gl.group_id, gl.reported_by
        limit 1
     ) nxt
  ),
  -- Newest fix from each Faci's phone (one index lookup per phone). Fixes
  -- with no reporter, if any, count as one phone per group, as before.
  per_faci as (
    select ph.group_id, last.lat, last.lng, last.accuracy_m, last.created_at
      from phones ph
      join visible v on v.id = ph.group_id
     cross join lateral (
       select gl.lat, gl.lng, gl.accuracy_m, gl.created_at
         from public.group_locations gl
        where gl.source = 'gps'
          and gl.group_id = ph.group_id
          and gl.reported_by = ph.reported_by
          and gl.created_at > now() - interval '12 hours'
        order by gl.created_at desc
        limit 1
     ) last
    union all
    (select distinct on (gl.group_id)
            gl.group_id, gl.lat, gl.lng, gl.accuracy_m, gl.created_at
       from public.group_locations gl
       join visible v on v.id = gl.group_id
      where gl.source = 'gps'
        and gl.reported_by is null
        and gl.created_at > now() - interval '12 hours'
      order by gl.group_id, gl.created_at desc)
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
