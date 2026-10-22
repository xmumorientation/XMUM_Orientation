-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0098: a projector's picture and place are a group's reward
--
-- A group that holds all 5 pieces of a key taps the key on its Items page
-- and sees that projector's picture (where its NFC card is) and its place.
-- Until then the projector is only its code name (Star, Wheel, Orbit).
--
-- * game_config: Freshie and Faci no longer read the puzzle_image_<location>
--   (0005) and projector_place_<location> (0097) keys. Everyone else signed
--   in still reads every key ("all read config", 0002).
-- * fn_my_projector_clues(): the picture and place of each projector the
--   caller's group has earned: all 5 pieces of its key, or the group lit
--   it. Staff (any role but Freshie and Faci) get all three. name, short
--   and image_url are null when Admin has not set them.
--
-- Not covered: the pictures sit in the public puzzle-images bucket, so a
-- picture's own link still opens for anyone who has it. The file names
-- carry the upload time, so they are hard to guess.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Who reads which config keys ─────────────────────────────────────────
drop policy if exists "all read config" on public.game_config;
create policy "all read config" on public.game_config
  for select using (
    auth.uid() is not null
    and (
      coalesce(public.my_role()::text, '') not in ('freshie', 'faci')
      or not (key like 'puzzle\_image\_%' or key like 'projector\_place\_%')
    )
  );

-- ── The clues a group has earned ────────────────────────────────────────
create or replace function public.fn_my_projector_clues()
returns table (
  location public.projector_location,
  name text,
  short text,
  image_url text
)
language sql stable security definer set search_path = public
as $$
  with earned as (
    select l.location
      from unnest(enum_range(null::public.projector_location)) as l (location)
     where coalesce(public.my_role()::text, '') not in ('freshie', 'faci')
        or exists (
          select 1 from public.projectors p
           where p.location = l.location and p.activated_by_group = public.my_group_id()
        )
        or (
          select count(distinct i.puzzle_index)
            from public.inventory v
            join public.items i on i.id = v.item_id
           where v.group_id = public.my_group_id()
             and i.type = 'puzzle'
             and i.puzzle_location = l.location
        ) >= 5
  )
  select e.location,
         nullif(trim(pl.value ->> 'name'), ''),
         nullif(trim(pl.value ->> 'short'), ''),
         nullif(im.value #>> '{}', '')
    from earned e
    left join public.game_config pl on pl.key = 'projector_place_' || e.location
    left join public.game_config im on im.key = 'puzzle_image_' || e.location
   order by e.location;
$$;

revoke all on function public.fn_my_projector_clues() from public, anon;
grant execute on function public.fn_my_projector_clues() to authenticated;
