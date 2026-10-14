-- Day 2 test stations: two per map building, all Available.
-- Run once in the Supabase SQL Editor (safe to re-run: existing codes are skipped).
--
-- * Adds <prefix>-1 and <prefix>-2 to every building on the campus map
--   (A1–A5, B1, Track & Field = TF, Tennis Court = TC, Volleyball Court = VC),
--   so every building has at least two Day 2 stations and shows a badge.
-- * Sets every Day 2 station that is on a building to Available.
--   "TBD" stations (no location yet) are left as they are.
-- Names are "Day 2 · <code>"; rename them and set the game on Admin → Stations.
-- Needs migration 0069 (Tennis Court / Volleyball Court areas).

insert into public.stations (name, day, area, code, purpose, status, station_number, map_x, map_y)
select 'Day 2 · ' || b.prefix || '-' || n,
       2, b.area, b.prefix || '-' || n, '', 'available',
       (select coalesce(max(s.station_number), 0) from public.stations s where s.day = 2)
         + row_number() over (order by b.ord, n),
       b.x, b.y
  from (values
    (1, 'A1', 'A1', 50.48, 12.98),
    (2, 'A2', 'A2', 46.73, 17.05),
    (3, 'A3', 'A3', 42.98, 21.12),
    (4, 'A4', 'A4', 39.06, 25.17),
    (5, 'A5', 'A5', 35.32, 29.23),
    (6, 'B1', 'B1', 36.26, 58.20),
    (7, 'Track & Field', 'TF', 23.39, 46.20),
    (8, 'Tennis Court', 'TC', 35.62, 52.62),
    (9, 'Volleyball Court', 'VC', 30.21, 58.32)
  ) as b(ord, area, prefix, x, y)
 cross join generate_series(1, 2) n
 where not exists (
   select 1 from public.stations s where s.code = b.prefix || '-' || n
 );

update public.stations
   set status = 'available'
 where day = 2
   and area <> 'TBD';
