-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0072: HOGM may set each day's game length
--
-- The live fn_phase_control (bonding-session 0032 / 0036) takes a game's
-- length from game_config "bonding_session_duration_day1" / "_day2", not
-- from phases.duration_minutes. Admin and HOGM now save both
-- (src/lib/gameLength.ts), so HOGM needs those two config keys as well as
-- the puzzle_image_* keys 0071 gave them. Kill-switches and every other key
-- stay Admin only.
--
-- Patches the installed fn_set_config like 0071, and stops (changing
-- nothing) if 0071's check is not there. Run inside begin; ... commit;.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  f constant regprocedure := 'public.fn_set_config(text,jsonb)'::regprocedure;
  def text := pg_get_functiondef('public.fn_set_config(text,jsonb)'::regprocedure);
  check_0071 constant text := $c$(public.is_game_lead() and p_key like 'puzzle\_image\_%')$c$;
begin
  if position(check_0071 in def) = 0 then
    raise exception '0072: run 0071 first (% has no HOGM puzzle check); nothing changed', f;
  end if;
  execute replace(def, check_0071,
    $c$(public.is_game_lead() and (p_key like 'puzzle\_image\_%'
        or p_key in ('bonding_session_duration_day1', 'bonding_session_duration_day2')))$c$);
end $$;
