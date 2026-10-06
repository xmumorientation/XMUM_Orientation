-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0049: Live control
--
-- Games (Admin toggles them by hand, Live control header):
--   * fn_game_toggle starts or ends a game (phases: day1 / day2 / endgame).
--     A started game has no end time; it runs until Admin ends it. The game
--     rules (phase_active) follow it.
--   * Stations follow their day's game: starting it opens that day's closed
--     stations (Available); ending it closes them. GMs still toggle Busy.
--
-- Schedule items (Live schedule) are separate from the games. Each has:
--   * planned times (starts_at / ends_at): what the Welcome page counts to
--     before the item starts. Adjusting a live timer never moves them.
--   * a session: an attendance session Admin opens and closes by hand
--     (fn_schedule_session). Created on the first Open.
--   * a live run that follows the planned times by itself: it is live from
--     its planned start to its live end (the planned end, unless Admin
--     changed it in Live control). Admin can pause, resume, move the end
--     (±minutes or a new time), stop it early, or reset to the planned
--     times (fn_schedule_timer). The schedule is never changed.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Schedule item columns ───────────────────────────────────────────

alter table public.schedule_items
  add column if not exists starts_at  timestamptz,
  add column if not exists ends_at    timestamptz,
  add column if not exists session_id integer references public.attendance_sessions (id) on delete set null,
  add column if not exists timer_end_override     timestamptz,
  add column if not exists timer_state            text not null default 'idle',
  add column if not exists timer_started_at       timestamptz,
  add column if not exists timer_ends_at          timestamptz,
  add column if not exists timer_paused_remaining integer;

alter table public.schedule_items drop constraint if exists schedule_items_timer_state_check;
alter table public.schedule_items add constraint schedule_items_timer_state_check
  check (timer_state in ('idle', 'running', 'paused', 'ended'));

alter table public.schedule_items drop constraint if exists schedule_items_times_check;
alter table public.schedule_items add constraint schedule_items_times_check
  check (starts_at is null or ends_at is null or ends_at > starts_at);

-- ── 2. Games: manual start / end ───────────────────────────────────────

create or replace function public.fn_game_toggle(p_phase_key text, p_on boolean)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not exists (select 1 from public.phases where key = p_phase_key) then
    raise exception 'PHASE_NOT_FOUND';
  end if;

  if p_on then
    update public.phases
       set state = 'active', started_at = now(), ends_at = null, paused_remaining = null
     where key = p_phase_key;
  else
    update public.phases
       set state = 'ended', ends_at = now(), paused_remaining = null
     where key = p_phase_key;
  end if;

  perform public.audit(case when p_on then 'game.start' else 'game.end' end,
    'phase:' || p_phase_key, '{}'::jsonb);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fn_game_toggle(text, boolean) from public, anon;
grant execute on function public.fn_game_toggle(text, boolean) to authenticated;

-- Stations follow their day's game.
create or replace function public.trg_phase_station_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_day integer := case new.key when 'day1' then 1 when 'day2' then 2 end;
begin
  if v_day is null or new.state = old.state then
    return new;
  end if;

  if new.state = 'active' and old.state in ('pending', 'ended') then
    update public.stations set status = 'available'
     where day = v_day and status = 'closed';
  elsif new.state in ('ended', 'pending') then
    update public.stations set status = 'closed'
     where day = v_day and status <> 'closed';
  end if;
  return new;
end;
$$;

drop trigger if exists phase_station_status on public.phases;
create trigger phase_station_status
  after update of state on public.phases
  for each row execute function public.trg_phase_station_status();

-- ── 3. Schedule timer: auto-run by planned times ───────────────────────
-- An item is live from its planned start (starts_at) until its live end:
-- timer_end_override if Admin changed it in Live control, else the planned
-- end (ends_at). Nobody presses Start. Admin only adjusts the live run:
--   pause / resume       freeze the countdown, then continue
--   extend (±minutes)    move the live end
--   set_end (p_end_at)   set the live end
--   end                  stop it now (the countdown moves to the next item)
--   reset                back to the planned times
-- The schedule's planned times are never changed here.

drop function if exists public.fn_schedule_timer(integer, text, integer);
drop function if exists public.fn_schedule_timer(integer, text, integer, timestamptz);

create or replace function public.fn_schedule_timer(
  p_item_id integer,
  p_action  text,
  p_minutes integer default 0,
  p_end_at  timestamptz default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v public.schedule_items%rowtype;
  v_end timestamptz;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select * into v from public.schedule_items where id = p_item_id for update;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;

  v_end := coalesce(v.timer_end_override, v.ends_at);

  if p_action = 'pause' then
    if v.timer_state = 'paused' then raise exception 'NOT_ACTIVE'; end if;
    if v_end is null or v_end <= now() then raise exception 'NOT_ACTIVE'; end if;
    update public.schedule_items
       set timer_state = 'paused',
           timer_paused_remaining = greatest(0, extract(epoch from (v_end - now()))::integer)
     where id = v.id;

  elsif p_action = 'resume' then
    if v.timer_state <> 'paused' then raise exception 'NOT_PAUSED'; end if;
    update public.schedule_items
       set timer_state = 'idle',
           timer_end_override = now() + make_interval(secs => coalesce(v.timer_paused_remaining, 0)),
           timer_paused_remaining = null
     where id = v.id;

  elsif p_action = 'extend' then
    if v.timer_state = 'paused' then
      update public.schedule_items
         set timer_paused_remaining = greatest(0, coalesce(v.timer_paused_remaining, 0) + p_minutes * 60)
       where id = v.id;
    else
      if v_end is null then raise exception 'NO_END_TIME'; end if;
      update public.schedule_items
         set timer_end_override = greatest(now(), v_end) + make_interval(mins => p_minutes),
             timer_state = 'idle'
       where id = v.id;
    end if;

  elsif p_action = 'set_end' then
    if p_end_at is null then raise exception 'NO_END_TIME'; end if;
    if v.timer_state = 'paused' then
      if p_end_at <= now() then raise exception 'END_TIME_PASSED'; end if;
      update public.schedule_items
         set timer_paused_remaining = extract(epoch from (p_end_at - now()))::integer
       where id = v.id;
    else
      update public.schedule_items
         set timer_end_override = p_end_at, timer_state = 'idle'
       where id = v.id;
    end if;

  elsif p_action = 'end' then
    update public.schedule_items
       set timer_state = 'ended', timer_paused_remaining = null
     where id = v.id;

  elsif p_action = 'reset' then
    update public.schedule_items
       set timer_state = 'idle', timer_started_at = null, timer_ends_at = null,
           timer_paused_remaining = null, timer_end_override = null
     where id = v.id;

  else
    raise exception 'UNKNOWN_ACTION';
  end if;

  perform public.audit('schedule_timer.' || p_action, 'schedule_item:' || p_item_id,
    jsonb_build_object('minutes', p_minutes, 'end_at', p_end_at));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fn_schedule_timer(integer, text, integer, timestamptz) from public, anon;
grant execute on function public.fn_schedule_timer(integer, text, integer, timestamptz) to authenticated;

-- An earlier draft ended manually started timers with a pg_cron job; items
-- now end by their time, so remove it.
do $$
begin
  perform cron.unschedule('schedule-timer-expire');
exception when others then null;
end $$;
drop function if exists public.fn_schedule_expire();

-- ── 4. Session: open / close by hand ───────────────────────────────────

create or replace function public.fn_schedule_session(p_item_id integer, p_action text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v public.schedule_items%rowtype;
  v_session integer;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select * into v from public.schedule_items where id = p_item_id for update;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  v_session := v.session_id;

  if p_action = 'open' then
    if v_session is null then
      insert into public.attendance_sessions (name, starts_at, ends_at, created_by)
      values (v.day_label || ' · ' || v.title, v.starts_at, v.ends_at, auth.uid())
      returning id into v_session;
      update public.schedule_items set session_id = v_session where id = v.id;
    else
      update public.attendance_sessions set closed = false where id = v_session;
    end if;
  elsif p_action = 'close' then
    if v_session is null then raise exception 'SESSION_NOT_OPEN'; end if;
    update public.attendance_sessions set closed = true where id = v_session;
  else
    raise exception 'UNKNOWN_ACTION';
  end if;

  perform public.audit('schedule_session.' || p_action, 'schedule_item:' || p_item_id,
    jsonb_build_object('session', v_session));

  return jsonb_build_object('ok', true, 'session_id', v_session);
end;
$$;

revoke all on function public.fn_schedule_session(integer, text) from public, anon;
grant execute on function public.fn_schedule_session(integer, text) to authenticated;

-- Live control and the Welcome page follow these live.
do $$ begin alter publication supabase_realtime add table public.attendance_sessions; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.schedule_items; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.phases; exception when others then null; end $$;

-- ── 5. Clean up an earlier draft of this migration ─────────────────────
-- An earlier version linked schedule items to games (kind, phase_key) and
-- added fn_roll_call. Games are now toggled separately (section 2).

-- the draft added an Endgame row to the schedule; Endgame is a game toggle now
do $$
begin
  execute 'delete from public.schedule_items where phase_key = ''endgame'' and timer_state = ''idle''';
exception when undefined_column then null;
end $$;

drop trigger if exists schedule_phase_duration on public.schedule_items;
drop function if exists public.trg_schedule_phase_duration();
drop function if exists public.fn_roll_call(integer, text);
alter table public.schedule_items drop constraint if exists schedule_items_kind_check;
alter table public.schedule_items drop constraint if exists schedule_items_game_phase_check;
drop index if exists public.schedule_items_phase_key_idx;
alter table public.schedule_items drop column if exists kind;
alter table public.schedule_items drop column if exists phase_key;
-- the draft's timer counted a length; it now counts to an end time
alter table public.schedule_items drop column if exists timer_minutes;
