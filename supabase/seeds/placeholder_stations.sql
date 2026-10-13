-- Placeholder stations: 10 for Day 1 and 10 for Day 2, no location yet.
-- Run once in the Supabase SQL Editor (safe to re-run: existing names are skipped).
-- Each starts Closed, area "TBD" and code "TBD-<number>". Set the real block, floor,
-- game and risk later on Admin → Stations (Edit), then assign Game Masters there.

-- The area check only allowed the real buildings; also allow "TBD" (no location yet).
alter table public.stations drop constraint if exists stations_area_building;
alter table public.stations
  add constraint stations_area_building
  check (area in ('A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'Track & Field', 'TBD'));

-- station_number must be unique per day, so numbering continues after the
-- highest number already used that day.
insert into public.stations (name, day, area, code, purpose, status, station_number)
select 'Day ' || d || ' Station ' || n, d, 'TBD',
       'TBD-' || (b.base + n), '', 'closed', b.base + n
  from generate_series(1, 2) d
 cross join generate_series(1, 10) n
 cross join lateral (
   select coalesce(max(s.station_number), 0) as base
     from public.stations s where s.day = d
 ) b
 where not exists (
   select 1 from public.stations s where s.name = 'Day ' || d || ' Station ' || n
 );
