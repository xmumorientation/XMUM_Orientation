-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0102: the Day 2 game's inner schedule, and no more Pause
-- (run after 0101). Plan: docs/plans/day2-inner-schedule.md
--
-- Segments, in minutes from the Day 2 game's real start (phases day2):
--   normal1   0 .. challenge_start_min      station game on, blind box off, funfair off
--   challenge .. challenge_end_min          blind box on            ("CHALLENGE MODE")
--   normal2   .. funfair_start_min          blind box on
--   funfair   .. the game's end             blind box on, funfair on (light the map)
-- Outside the game: "off" (station game on, blind box and funfair off).
-- Admin can hold a segment by hand (manual_segment, even with no game on,
-- for tests) until "auto", and flip a switch; a flip lasts until the segment
-- changes. Kill-switches (blindbox_disabled, nfc_disabled, tokens_frozen)
-- are still checked by the functions themselves. Rehearsal mode does not
-- bypass these switches.
--
-- The functions that sell a blind box, light the map or record a Day 2 result
-- get a guard as their first statement (fn_day2_guard). They are patched from
-- their live definitions (pg_get_functiondef), because the live database runs
-- versions that are not in this repo (fn_nfc_v2_redeem_nfc_card). The old
-- Endgame phase rule is removed: the Funfair switch replaces it.
-- fn_phase_control and fn_schedule_timer refuse "pause" (NO_PAUSE).
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.day2_schedule (
  id integer primary key default 1 check (id = 1),
  challenge_start_min integer not null default 60,
  challenge_end_min integer not null default 90,
  funfair_start_min integer not null default 120,
  manual_segment text check (manual_segment in ('normal1', 'challenge', 'normal2', 'funfair')),
  overrides jsonb not null default '{}'::jsonb,
  override_segment text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (0 <= challenge_start_min and challenge_start_min <= challenge_end_min
         and challenge_end_min <= funfair_start_min)
);
insert into public.day2_schedule (id) values (1) on conflict do nothing;

alter table public.day2_schedule enable row level security;
drop policy if exists day2_schedule_read on public.day2_schedule;
create policy day2_schedule_read on public.day2_schedule for select to anon, authenticated using (true);
grant select on public.day2_schedule to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.day2_schedule;
exception when others then
  raise notice 'day2_schedule not added to realtime (%); pages refresh every 15 s.', sqlerrm;
end $$;

-- The segment on now.
create or replace function public.fn_day2_segment()
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  s public.day2_schedule;
  v_start timestamptz;
  v_min numeric;
begin
  select * into s from public.day2_schedule where id = 1;
  if s.manual_segment is not null then return s.manual_segment; end if;
  select started_at into v_start from public.phases
   where key = 'day2' and state::text = 'active' and started_at is not null
     and (ends_at is null or ends_at > now());
  if v_start is null then return 'off'; end if;
  v_min := extract(epoch from now() - v_start) / 60;
  return case
    when v_min >= s.funfair_start_min then 'funfair'
    when v_min >= s.challenge_end_min then 'normal2'
    when v_min >= s.challenge_start_min then 'challenge'
    else 'normal1' end;
end;
$$;

-- A switch now: the segment's default, or Admin's flip for this segment.
-- Returns null when it is on, else why it is off: 'default' or 'admin'.
create or replace function public.fn_day2_off_reason(p_switch text)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  s public.day2_schedule;
  v_seg text := public.fn_day2_segment();
  v_on boolean;
begin
  select * into s from public.day2_schedule where id = 1;
  if s.override_segment = v_seg and s.overrides ? p_switch then
    v_on := (s.overrides ->> p_switch)::boolean;
    return case when v_on then null else 'admin' end;
  end if;
  v_on := case p_switch
    when 'station' then true
    when 'blindbox' then v_seg in ('challenge', 'normal2', 'funfair')
    when 'funfair' then v_seg = 'funfair'
    else true end;
  return case when v_on then null else 'default' end;
end;
$$;

-- First statement of every gated function: raises when the switch is off.
create or replace function public.fn_day2_guard(p_switch text)
returns void
language plpgsql stable security definer set search_path = public
as $$
declare
  v_why text := public.fn_day2_off_reason(p_switch);
begin
  if v_why is null then return; end if;
  raise exception '%', case p_switch
    when 'blindbox' then case v_why when 'admin' then 'BB_OFF_BY_ADMIN' else 'BB_NOT_YET' end
    when 'funfair' then case v_why when 'admin' then 'FUNFAIR_OFF_BY_ADMIN' else 'FUNFAIR_NOT_YET' end
    else 'STATION_GAME_OFF' end;
end;
$$;

-- Everything a page needs; useDay2State works out the segment from it on time.
create or replace function public.fn_day2_state()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'game_on', p.key is not null,
    'game_started_at', p.started_at,
    'game_ends_at', p.ends_at,
    'challenge_start_min', s.challenge_start_min,
    'challenge_end_min', s.challenge_end_min,
    'funfair_start_min', s.funfair_start_min,
    'manual_segment', s.manual_segment,
    'overrides', s.overrides,
    'override_segment', s.override_segment,
    'server_now', now())
    from public.day2_schedule s
    left join public.phases p
      on p.key = 'day2' and p.state::text = 'active' and p.started_at is not null
     and (p.ends_at is null or p.ends_at > now())
   where s.id = 1;
$$;

-- Admin only. Actions:
--   set_times     p_challenge_start_min, p_challenge_end_min, p_funfair_start_min
--   start_segment p_segment (held until 'auto')
--   auto          follow the clock again
--   set_switch    p_switch ('station' | 'blindbox' | 'funfair'), p_on; until the segment changes
create or replace function public.fn_day2_control(
  p_action text,
  p_segment text default null,
  p_switch text default null,
  p_on boolean default null,
  p_challenge_start_min integer default null,
  p_challenge_end_min integer default null,
  p_funfair_start_min integer default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  s public.day2_schedule;
  v_seg text;
begin
  if not public.is_admin() then raise exception 'PERMISSION_DENIED'; end if;
  select * into s from public.day2_schedule where id = 1 for update;

  if p_action = 'set_times' then
    update public.day2_schedule
       set challenge_start_min = coalesce(p_challenge_start_min, challenge_start_min),
           challenge_end_min = coalesce(p_challenge_end_min, challenge_end_min),
           funfair_start_min = coalesce(p_funfair_start_min, funfair_start_min)
     where id = 1;
  elsif p_action = 'start_segment' then
    if p_segment not in ('normal1', 'challenge', 'normal2', 'funfair') then raise exception 'UNKNOWN_ACTION'; end if;
    update public.day2_schedule set manual_segment = p_segment, overrides = '{}', override_segment = null where id = 1;
  elsif p_action = 'auto' then
    update public.day2_schedule set manual_segment = null, overrides = '{}', override_segment = null where id = 1;
  elsif p_action = 'set_switch' then
    if p_switch not in ('station', 'blindbox', 'funfair') or p_on is null then raise exception 'UNKNOWN_ACTION'; end if;
    v_seg := public.fn_day2_segment();
    update public.day2_schedule
       set overrides = (case when override_segment = v_seg then overrides else '{}'::jsonb end)
                       || jsonb_build_object(p_switch, p_on),
           override_segment = v_seg
     where id = 1;
  else
    raise exception 'UNKNOWN_ACTION';
  end if;

  update public.day2_schedule set updated_by = auth.uid(), updated_at = now() where id = 1;
  perform public.audit('day2.' || p_action, 'day2_schedule',
    jsonb_build_object('segment', p_segment, 'switch', p_switch, 'on', p_on,
      'challenge_start_min', p_challenge_start_min, 'challenge_end_min', p_challenge_end_min,
      'funfair_start_min', p_funfair_start_min));
  return public.fn_day2_state();
end;
$$;

revoke all on function public.fn_day2_state() from public;
grant execute on function public.fn_day2_state() to anon, authenticated;
revoke all on function public.fn_day2_control(text, text, text, boolean, integer, integer, integer) from public;
grant execute on function public.fn_day2_control(text, text, text, boolean, integer, integer, integer) to authenticated;
revoke all on function public.fn_day2_segment() from public;
revoke all on function public.fn_day2_off_reason(text) from public;
revoke all on function public.fn_day2_guard(text) from public;
grant execute on function public.fn_day2_segment(), public.fn_day2_off_reason(text), public.fn_day2_guard(text)
  to anon, authenticated;

-- ── Patch the live functions ────────────────────────────────────────────
-- Adds `stmt` as the first statement of every overload of `fn` (after the
-- body's first "begin"), once. A function that is missing, or not plpgsql,
-- is skipped with a notice.
create or replace function pg_temp.day2_patch(fn text, stmt text, marker text)
returns void language plpgsql as $$
declare
  f regprocedure;
  def text;
  head integer;
  patched text;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = fn loop
    def := pg_get_functiondef(f);
    if position(marker in def) > 0 then continue; end if;
    -- the body starts at pg_get_functiondef's "AS $function$" line
    head := position(E'\nAS ' in def);
    patched := left(def, head) || regexp_replace(substr(def, head + 1), E'\\mbegin\\M', E'begin\n  ' || stmt || E'\n', 'i');
    if patched = def then
      raise notice '0102: % has no plpgsql begin; not patched', f;
      continue;
    end if;
    execute patched;
  end loop;
  if not found then raise notice '0102: % not found; not patched', fn; end if;
end;
$$;

-- Removes the old Endgame phase rule (the Funfair switch replaces it).
create or replace function pg_temp.day2_drop(fn text, old text, new text)
returns void language plpgsql as $$
declare
  f regprocedure;
  def text;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = fn loop
    def := pg_get_functiondef(f);
    if position(old in def) > 0 then execute replace(def, old, new); end if;
  end loop;
end;
$$;

select pg_temp.day2_drop('fn_day2_challenge', ' or public.phase_active(''endgame'')', '');
select pg_temp.day2_drop('fn_activate_projector',
  'if not public.phase_active(''endgame'') then raise exception ''NOT_ENDGAME''; end if;', '');

select pg_temp.day2_patch('fn_day2_challenge', 'perform public.fn_day2_guard(''station'');', 'fn_day2_guard(''station'')');
select pg_temp.day2_patch(f, 'perform public.fn_day2_guard(''blindbox'');', 'fn_day2_guard(''blindbox'')')
  from unnest(array['fn_bb_buy', 'fn_bb_buy_at', 'fn_bb_seller_preview']) f;
select pg_temp.day2_patch(f, 'perform public.fn_day2_guard(''funfair'');', 'fn_day2_guard(''funfair'')')
  from unnest(array['fn_nfc_v2_redeem_nfc_card', 'fn_activate_projector', 'fn_activate_projector_manual',
                    'fn_demo_activate_projector']) f;
select pg_temp.day2_patch(f, 'if p_action = ''pause'' then raise exception ''NO_PAUSE''; end if;', '''NO_PAUSE''')
  from unnest(array['fn_phase_control', 'fn_schedule_timer']) f;
