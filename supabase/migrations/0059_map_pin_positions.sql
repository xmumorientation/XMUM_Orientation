-- Place existing stations and projectors on the illustrated campus map.
-- map_x and map_y are percentages of the map image (0–100), matching CampusMap.tsx.
-- A1 is the far end of the red-roof row (toward the monument). A5 is the near end.
-- Court stations sit on the lawn between the track and B1; the Figma art has no separate courts building.

update public.stations as s
set map_x = v.map_x, map_y = v.map_y
from (
  values
    ('A4-1', 37.2::numeric, 28.4::numeric),
    ('A4-2', 39.2, 29.2),
    ('A4-3', 41.0, 27.8),
    ('A5-1', 33.4, 32.6),
    ('A5-2', 35.5, 33.4),
    ('A5-3', 37.2, 32.0),
    ('B1-1', 33.6, 63.8),
    ('B1-2', 36.4, 64.8),
    ('B1-3', 39.0, 63.2),
    ('CRT-1', 29.5, 53.0),
    ('CRT-2', 31.8, 55.5),
    ('CRT-3', 28.4, 57.0)
) as v(code, map_x, map_y)
where s.code = v.code;

update public.projectors as p
set map_x = v.map_x, map_y = v.map_y
from (
  values
    ('A3', 44.6::numeric, 19.2::numeric),
    ('B1', 39.8, 56.5),
    ('TF', 26.5, 48.8)
) as v(location, map_x, map_y)
where p.location = v.location;
