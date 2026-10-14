-- Migration 0085: put the lightbulbs on the centre of their buildings.
--
-- The projectors table still had the seed spots from the old rectangle map
-- (B1 80,50 · A3 14,22 · TF 68,82), which land on the field and the edges of
-- the current art. The map used to hide this with fixed spots in code
-- (PROJECTOR_SPOTS, slightly off the buildings); since the bulbs became
-- movable (0083) it reads the table. Each bulb now sits on its building's
-- anchor in src/lib/mapBuildings.ts.
--
-- Only rows still on a seed spot or the old code spot are changed, so a bulb
-- Admin has already moved on the map is kept.

update public.projectors as p
   set map_x = v.map_x, map_y = v.map_y
  from (values
    ('A3'::public.projector_location, 42.98::numeric, 21.12::numeric, 14::numeric, 22::numeric, 44.59::numeric, 19.20::numeric),
    ('B1', 36.26, 58.20, 80, 50, 39.79, 56.51),
    ('TF', 23.39, 46.20, 68, 82, 26.50, 48.81)
  ) as v(location, map_x, map_y, seed_x, seed_y, old_x, old_y)
 where p.location = v.location
   and ((p.map_x = v.seed_x and p.map_y = v.seed_y)
     or (p.map_x = v.old_x and p.map_y = v.old_y));
