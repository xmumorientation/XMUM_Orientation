-- Migration 0096: which group lit a lightbulb is Committee only.
--
-- Freshie, Faci and GM (gm, guardian_gm) now see only that a lightbulb
-- (projector) is lit, not which group lit it. A Freshie or Faci still sees
-- it when their own group lit it. Committee tier (is_committee(): HOF, HOGM,
-- Committee, Admin) still sees every group.
--
-- * projectors: only Committee tier reads the table. Before this, anyone
--   signed in could read activated_by_group straight from the table.
-- * fn_map_lightbulbs (0083): the same rows as before, but activated_by_group
--   and group_name are null unless the viewer is Committee tier or the bulb
--   is their own group's.
-- * fn_projector_states: all three projectors with the same rule, for the
--   pages that read the table before (Freshie Items, Guardian). No map spot,
--   so an unlit bulb's place stays secret (0083).
-- * Realtime sends projectors events only to those who can read the table, so
--   a change to projectors also writes game_config 'lightbulbs_changed_at'.
--   Everyone reads game_config, and the map and Items page reload on it.

-- ── Who may see the group ───────────────────────────────────────────────
create or replace function public.can_see_lit_group(p_group_id integer)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_group_id is not null
     and (public.is_committee() or p_group_id = public.my_group_id());
$$;

revoke all on function public.can_see_lit_group(integer) from public, anon;
grant execute on function public.can_see_lit_group(integer) to authenticated;

-- ── The table: Committee tier only ──────────────────────────────────────
drop policy if exists "all read projectors" on public.projectors;
drop policy if exists "committee reads projectors" on public.projectors;
create policy "committee reads projectors" on public.projectors
  for select using (public.is_committee());

-- ── The map's bulbs ─────────────────────────────────────────────────────
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
         case when public.can_see_lit_group(p.activated_by_group) then p.activated_by_group end,
         case when public.can_see_lit_group(p.activated_by_group) then g.name end,
         p.activated_at, p.activated_manually
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

-- ── Every projector, lit or not (Items, Guardian) ───────────────────────
create or replace function public.fn_projector_states()
returns table (
  location public.projector_location,
  name text,
  activated_by_group integer,
  activated_at timestamptz,
  activated_manually boolean
)
language sql stable security definer set search_path = public
as $$
  select p.location, p.name,
         case when public.can_see_lit_group(p.activated_by_group) then p.activated_by_group end,
         p.activated_at, p.activated_manually
    from public.projectors p
   order by p.location;
$$;

revoke all on function public.fn_projector_states() from public, anon;
grant execute on function public.fn_projector_states() to authenticated;

-- ── Live updates for those who cannot read the table ────────────────────
create or replace function public.trg_projectors_changed()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.game_config (key, value, updated_at)
  values ('lightbulbs_changed_at', to_jsonb(now()), now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
  return null;
end;
$$;

drop trigger if exists projectors_changed on public.projectors;
create trigger projectors_changed
  after insert or update or delete on public.projectors
  for each statement execute function public.trg_projectors_changed();
