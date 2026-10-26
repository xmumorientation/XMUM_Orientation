-- Migration 0108: every signed-in account sees every group's location.
--
-- Ben (2026-10-22): the group locations are open to everyone in the app:
-- Freshies, Facis, Game Masters and Committee tier alike. This replaces 0094
-- (which had limited Freshies and Facis to their own group and left GMs with
-- none) and goes back to 0089's rule, with GMs included.
--   * fn_group_positions(): every group's GPS fix and station check-in.
--   * fn_group_faci_status(): a group's Facilitators and when each phone last
--     reported, for the map's "Facis" list. Phone numbers stay Committee tier only.
-- Run this one; do not run 0094 after it (0094 would narrow the list again).
-- The bodies are 0094's and 0082's with the visibility condition changed.
-- Safe to run again.

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
     where auth.uid() is not null
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
     and auth.uid() is not null
   order by p.full_name;
$$;

revoke all on function public.fn_group_faci_status(integer) from public, anon;
grant execute on function public.fn_group_faci_status(integer) to authenticated;
