-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0097: Admin and HOGM set each projector's place
--
-- Where the three projectors stand is not decided yet. B1, A3 and TF stay
-- the projectors' ids (projector_location), but the place a page shows is
-- now game_config "projector_place_<B1|A3|TF>", a JSON object
-- {"name": "B1 Basement", "short": "B1"}, set on Admin → Puzzles and on
-- HOGM's Game control → Puzzles. A missing key falls back to the old names
-- in code (PROJECTOR_LABELS). Like the puzzle pictures, everyone signed in
-- can read game_config, so a place is no more secret than it was in code.
--
-- Patches the installed fn_set_config like 0072, and stops (changing
-- nothing) if 0072's check is not there. Run inside begin; ... commit;.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  f constant regprocedure := 'public.fn_set_config(text,jsonb)'::regprocedure;
  def text := pg_get_functiondef('public.fn_set_config(text,jsonb)'::regprocedure);
  check_0072 constant text := $c$p_key like 'puzzle\_image\_%'$c$;
begin
  if position($c$projector\_place\_%$c$ in def) > 0 then
    return; -- already run
  end if;
  if (length(def) - length(replace(def, check_0072, ''))) / length(check_0072) <> 1 then
    raise exception '0097: run 0072 first (% has no single HOGM puzzle check); nothing changed', f;
  end if;
  execute replace(def, check_0072,
    $c$p_key like 'puzzle\_image\_%' or p_key like 'projector\_place\_%'$c$);
end $$;
