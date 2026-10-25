-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0101: the Day 1 and Day 2 games start themselves at their
-- planned time (run after 0100)
--
-- fn_game_autostart starts a day's game (phases day1 / day2) when its
-- schedule item ("Day 1 Game", "Day 2 Game") reaches its planned start. The
-- game runs until that item's end (Live control's new end, else the planned
-- end), so the Welcome page and the game timer reach zero together. Like a
-- Start from Live control, it only runs the timer: station statuses are not
-- changed (0078).
--
-- Start in Live control (fn_phase_control) still works at any time, so a
-- test run can go before the planned time. fn_game_autostart leaves a game
-- alone when:
--   * it is running or paused already (a test run still on at the planned
--     time keeps going; End it first to get the scheduled run);
--   * it was started at or after the planned start and then ended or ran
--     out: Admin's End is not undone;
--   * the other day's game is running or paused (only one game at a time);
--   * the schedule item was stopped in Live control, or its end has passed.
--
-- It runs every minute by pg_cron when available, and open pages call it the
-- moment a game's planned start comes (useEventCountdown). Safe for anyone to
-- call: it only starts a game whose planned time has come.
--
-- Works on both versions of the phases table: the bonding-session columns
-- (version, paused_at, updated_by, updated_at; 0032) and session_control_log
-- are written only when they exist.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_game_autostart()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_count integer := 0;
  v_bonding boolean := exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'phases' and column_name = 'version');
  v_log boolean := to_regclass('public.session_control_log') is not null;
begin
  for r in
    select s.id as item_id, s.title,
           coalesce(s.timer_end_override, s.ends_at) as end_at,
           p.id as phase_id, p.key, p.state::text as state
      from public.schedule_items s
      join public.phases p
        on p.key = 'day' || substring(lower(btrim(s.title)) from '^day\s*(\d+)\s+game$')
     where s.starts_at is not null
       and s.timer_state <> 'ended'
       and s.starts_at <= now()
       and coalesce(s.timer_end_override, s.ends_at) > now()
       and p.state::text not in ('active', 'paused')
       and (p.started_at is null or p.started_at < s.starts_at)
     order by s.starts_at
       for update of p skip locked
  loop
    continue when exists (
      select 1 from public.phases where id <> r.phase_id and state::text in ('active', 'paused'));

    update public.phases
       set state = 'active', started_at = now(), ends_at = r.end_at, paused_remaining = null
     where id = r.phase_id;
    if v_bonding then
      execute 'update public.phases set paused_at = null, updated_by = null, updated_at = now(),
               version = version + 1 where id = $1' using r.phase_id;
    end if;
    if v_log then
      execute 'insert into public.session_control_log
                 (phase_id, phase_key, action, previous_state, new_state, seconds_changed, actor_user_id)
               values ($1, $2, ''TIMER_STARTED'', $3, ''active'', 0, null)'
        using r.phase_id, r.key, r.state;
    end if;
    perform public.audit('game.autostart', 'phase:' || r.key,
      jsonb_build_object('schedule_item', r.item_id, 'title', r.title, 'ends_at', r.end_at));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.fn_game_autostart() from public;
grant execute on function public.fn_game_autostart() to anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('game-autostart', '* * * * *', 'select public.fn_game_autostart()');
exception when others then
  raise notice 'pg_cron not available (%); open pages start games at their planned time instead.', sqlerrm;
end $$;
