-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0052: games have a timer and end themselves
--
-- Live control starts a game with fn_phase_control('start'), which runs it
-- for its length (phases.duration_minutes, set by Admin before Start);
-- pause / resume / extend (±minutes) / end work as before. The game's
-- countdown shows on the sidebar timer, the big screen and the Freshie
-- game card. It is separate from the Welcome page countdown, which follows
-- the schedule.
--
-- fn_game_expire ends every running game whose time is up. Ending it closes
-- that day's stations (trigger from 0049) and locks its game rules. It runs
-- every minute by pg_cron when available, and any open app page calls it
-- the moment a game's countdown reaches zero. Safe for anyone to call: it
-- only ends games whose time has already run out.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_game_expire()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer;
begin
  with ended as (
    update public.phases
       set state = 'ended', paused_remaining = null
     where state = 'active' and ends_at is not null and ends_at <= now()
    returning key
  )
  select count(*) into v_count from ended;
  if v_count > 0 then
    perform public.audit('game.expired', 'phases', jsonb_build_object('count', v_count));
  end if;
  return v_count;
end;
$$;

revoke all on function public.fn_game_expire() from public;
grant execute on function public.fn_game_expire() to anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('game-timer-expire', '* * * * *', 'select public.fn_game_expire()');
exception when others then
  raise notice 'pg_cron not available (%); open pages end games when time is up instead.', sqlerrm;
end $$;
