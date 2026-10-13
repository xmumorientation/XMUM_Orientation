-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0071: Head of Game Masters runs the game too
--
-- HOGM gets the game controls Admin has in the game console, on their own
-- Ops page (Game control):
--   * start / pause / resume / ±minutes / end a day's game, and its length
--     (fn_phase_control, phases.duration_minutes)
--   * token rules (fn_update_game_config_rule)
--   * reset tokens and puzzles, still only in Rehearsal mode
--     (fn_reset_tokens_and_puzzles)
--   * stations: add, edit, delete, status (stations table), and their Game
--     Masters (fn_admin_station_gms, fn_admin_set_station_gms)
--   * puzzle pictures (storage bucket puzzle-images, and the
--     puzzle_image_<location> config keys only)
--   * NFC tokens: read the list (the API route allows HOGM separately)
--
-- Not for HOGM: kill-switches and every other config key (fn_set_config
-- stays Admin only for those), blind-box management, users, groups.
--
-- The live database does not match the repo for every function: it also ran
-- the bonding-session migrations, whose fn_phase_control (0032 / 0036) is
-- much larger. So this migration does not rewrite the functions. It takes
-- whatever version is installed and swaps only its permission check, and
-- stops (changing nothing) if a function does not have exactly one
-- is_admin() check to swap. Run it inside begin; ... commit;.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Helper ──────────────────────────────────────────────────────────────

create or replace function public.is_game_lead()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.my_role() in ('hogm', 'admin'), false);
$$;

-- ── Functions: is_admin() → is_game_lead() in the installed version ─────
-- CREATE OR REPLACE keeps each function's existing grants.

do $$
declare
  f regprocedure;
  def text;
  check_old constant text := 'public.is_admin()';
begin
  foreach f in array array[
    'public.fn_phase_control(text,text,integer)',
    'public.fn_update_game_config_rule(character varying,integer)',
    'public.fn_reset_tokens_and_puzzles()',
    'public.fn_admin_station_gms()',
    'public.fn_admin_set_station_gms(integer,uuid[])'
  ]::regprocedure[] loop
    def := pg_get_functiondef(f);
    if (length(def) - length(replace(def, check_old, ''))) / length(check_old) <> 1 then
      raise exception '0071: % does not have exactly one is_admin() check; nothing changed', f;
    end if;
    execute replace(def, check_old, 'public.is_game_lead()');
  end loop;

  -- fn_set_config: HOGM may set the puzzle_image_<location> keys only.
  f := 'public.fn_set_config(text,jsonb)'::regprocedure;
  def := pg_get_functiondef(f);
  if position('if not public.is_admin() then' in def) = 0
     or (length(def) - length(replace(def, check_old, ''))) / length(check_old) <> 1 then
    raise exception '0071: % has an unexpected permission check; nothing changed', f;
  end if;
  execute replace(def, 'if not public.is_admin() then',
    'if not (public.is_admin() or (public.is_game_lead() and p_key like ''puzzle\_image\_%'')) then');
end $$;

-- ── Game length before Start: HOGM may update phases (not insert/delete) ─

drop policy if exists "game lead updates phases" on public.phases;
create policy "game lead updates phases" on public.phases
  for update using (public.is_game_lead()) with check (public.is_game_lead());

-- ── Stations ────────────────────────────────────────────────────────────

drop policy if exists "admin manages stations" on public.stations;
drop policy if exists "game lead manages stations" on public.stations;
create policy "game lead manages stations" on public.stations
  for all using (public.is_game_lead()) with check (public.is_game_lead());

-- ── Puzzle pictures (storage, from 0005) ────────────────────────────────

drop policy if exists "admin writes puzzle images" on storage.objects;
drop policy if exists "admin updates puzzle images" on storage.objects;
drop policy if exists "admin deletes puzzle images" on storage.objects;
drop policy if exists "game lead writes puzzle images" on storage.objects;
drop policy if exists "game lead updates puzzle images" on storage.objects;
drop policy if exists "game lead deletes puzzle images" on storage.objects;
create policy "game lead writes puzzle images" on storage.objects
  for insert with check (bucket_id = 'puzzle-images' and public.is_game_lead());
create policy "game lead updates puzzle images" on storage.objects
  for update using (bucket_id = 'puzzle-images' and public.is_game_lead());
create policy "game lead deletes puzzle images" on storage.objects
  for delete using (bucket_id = 'puzzle-images' and public.is_game_lead());

-- ── NFC tokens: the issued list (minting is the API route) ──────────────

drop policy if exists "admin reads nfc tokens" on public.nfc_tokens;
drop policy if exists "game lead reads nfc tokens" on public.nfc_tokens;
create policy "game lead reads nfc tokens" on public.nfc_tokens
  for select using (public.is_game_lead());
