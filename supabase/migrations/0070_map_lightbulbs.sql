-- Migration 0070: Lightbulbs view on the campus map.
--
-- fn_map_lightbulbs(): the three lightbulbs (projectors B1, A3, TF) for the
-- map's Lightbulbs mode.
-- * A lit bulb (activated_at set) is returned to everyone, with the group
--   that lit it.
-- * An unlit bulb is returned only to Committee tier, or to everyone once
--   Admin turns on "Day 2 map layer" (game_config day2_map_layer), which is
--   when the map unlocks. Before that its place stays secret.
--
-- The map reads bulbs only through this function. The projectors table itself
-- is still readable by any logged-in user (Guardian, Activate and Bigscreen
-- read it); see ROADMAP item 3.
--
-- Admin moves a bulb by updating projectors.map_x / map_y, which the existing
-- "admin manages projectors" policy already allows.

create or replace function public.fn_map_lightbulbs()
returns table (
  location public.projector_location,
  name text,
  map_x numeric,
  map_y numeric,
  activated_by_group integer,
  group_name text,
  activated_at timestamptz,
  activated_manually boolean
)
language sql stable security definer set search_path = public
as $$
  select p.location, p.name, p.map_x, p.map_y,
         p.activated_by_group, g.name, p.activated_at, p.activated_manually
    from public.projectors p
    left join public.groups g on g.id = p.activated_by_group
   where p.activated_at is not null
      or public.is_committee()
      or exists (
        select 1 from public.game_config c
         where c.key = 'day2_map_layer'
           and c.value in ('true'::jsonb, '"true"'::jsonb)
      )
   order by p.location;
$$;

revoke all on function public.fn_map_lightbulbs() from public, anon;
grant execute on function public.fn_map_lightbulbs() to authenticated;
