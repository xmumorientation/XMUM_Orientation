-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0115: the Day 2 inner schedule is a list of segments (run after
-- 0114). Plan: docs/plans/day2-flexible-segments.md
--
-- * day2_schedule.segments: a jsonb list, 1 to 8 segments, each
--     { id, label, start_min, easy, medium, hard, blindbox, funfair }
--   The first starts at 0; each ends where the next starts; the last ends at
--   the game's end. The columns challenge_start_min, challenge_end_min and
--   funfair_start_min are gone; their times are replaced by the seed below.
-- * The Station Game switch is replaced by Easy, Medium and Hard (stations'
--   risk_tier low / medium / high). A tier that is off is closed: a GM's
--   Start game (fn_manual_checkin at a Day 2 station) and fn_day2_challenge
--   are refused with TIER_CLOSED. stations.status is not written.
-- * manual_segment and override_segment now hold a segment id (or 'off').
-- * Outside the game with no hold ("off"): all three tiers on, blind box off,
--   funfair off (as before for the station game).
-- Admin only (fn_day2_control). Kill-switches still win. Safe to run again.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.day2_schedule add column if not exists segments jsonb;

do $$
begin
  if exists (select 1 from public.day2_schedule where segments is null) then
    update public.day2_schedule set
      segments = '[
        {"id":"s1","label":"Opening","start_min":0,"easy":true,"medium":true,"hard":false,"blindbox":true,"funfair":false},
        {"id":"s2","label":"Hard Stations Open","start_min":60,"easy":true,"medium":true,"hard":true,"blindbox":true,"funfair":false},
        {"id":"s3","label":"Funfair","start_min":105,"easy":true,"medium":true,"hard":true,"blindbox":true,"funfair":true}
      ]'::jsonb,
      manual_segment = null, overrides = '{}'::jsonb, override_segment = null
     where segments is null;
  end if;
end $$;

alter table public.day2_schedule alter column segments set not null;
alter table public.day2_schedule alter column segments set default '[]'::jsonb;
alter table public.day2_schedule drop constraint if exists day2_schedule_manual_segment_check;
alter table public.day2_schedule drop column if exists challenge_start_min;
alter table public.day2_schedule drop column if exists challenge_end_min;
alter table public.day2_schedule drop column if exists funfair_start_min;

-- The segment on now: its id, or 'off'.
create or replace function public.fn_day2_segment()
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  s public.day2_schedule;
  v_start timestamptz;
  v_min numeric;
  v_id text;
begin
  select * into s from public.day2_schedule where id = 1;
  if s.manual_segment is not null
     and exists (select 1 from jsonb_array_elements(s.segments) e where e ->> 'id' = s.manual_segment) then
    return s.manual_segment;
  end if;
  select started_at into v_start from public.phases
   where key = 'day2' and state::text = 'active' and started_at is not null
     and (ends_at is null or ends_at > now());
  if v_start is null then return 'off'; end if;
  v_min := extract(epoch from now() - v_start) / 60;
  select e ->> 'id' into v_id
    from jsonb_array_elements(s.segments) e
   where (e ->> 'start_min')::numeric <= v_min
   order by (e ->> 'start_min')::numeric desc
   limit 1;
  return coalesce(v_id, 'off');
end;
$$;

-- A switch now: the segment's saved default, or Admin's flip for this segment.
-- Returns null when it is on, else why it is off: 'default' or 'admin'.
-- Switches: easy, medium, hard, blindbox, funfair.
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
  if v_seg = 'off' then
    v_on := p_switch in ('easy', 'medium', 'hard');
  else
    select coalesce((e ->> p_switch)::boolean, true) into v_on
      from jsonb_array_elements(s.segments) e where e ->> 'id' = v_seg;
    v_on := coalesce(v_on, true);
  end if;
  return case when v_on then null else 'default' end;
end;
$$;

-- First statement of every gated function: raises when the switch is off.
-- 'station' means the tier of the caller's own station (fn_day2_challenge).
create or replace function public.fn_day2_guard(p_switch text)
returns void
language plpgsql stable security definer set search_path = public
as $$
declare
  v_switch text := p_switch;
  v_tier public.risk_tier;
  v_station integer;
  v_why text;
begin
  if p_switch = 'station' then
    select st.id, st.risk_tier into v_station, v_tier
      from public.stations st join public.profiles p on p.station_id = st.id
     where p.id = auth.uid();
    if v_tier is null then return; end if; -- the function raises NO_STATION_ASSIGNED itself
    -- A group checked in here started while the tier was open (Start game is
    -- refused at a closed tier): it may still submit.
    if exists (select 1 from public.station_occupancy where station_id = v_station) then return; end if;
    v_switch := case v_tier when 'low' then 'easy' when 'medium' then 'medium' else 'hard' end;
  end if;
  v_why := public.fn_day2_off_reason(v_switch);
  if v_why is null then return; end if;
  raise exception '%', case v_switch
    when 'blindbox' then case v_why when 'admin' then 'BB_OFF_BY_ADMIN' else 'BB_NOT_YET' end
    when 'funfair' then case v_why when 'admin' then 'FUNFAIR_OFF_BY_ADMIN' else 'FUNFAIR_NOT_YET' end
    else 'TIER_CLOSED' end;
end;
$$;

-- Start game at a Day 2 station: a GM cannot start at a closed tier.
create or replace function public.fn_day2_guard_checkin(p_station_id integer)
returns void
language plpgsql stable security definer set search_path = public
as $$
declare
  v_st public.stations%rowtype;
begin
  if public.my_role() not in ('gm', 'guardian_gm') then return; end if;
  select * into v_st from public.stations where id = p_station_id;
  if not found or v_st.day <> 2 then return; end if;
  if public.fn_day2_off_reason(case v_st.risk_tier when 'low' then 'easy' when 'medium' then 'medium' else 'hard' end) is not null then
    raise exception 'TIER_CLOSED';
  end if;
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
    'segments', s.segments,
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
--   set_segments  p_segments: the whole list (times, labels, default switches,
--                 add, remove). Add / remove is refused while a segment is held.
--   start_segment p_segment (an id; held until 'auto')
--   auto          follow the clock again
--   set_switch    p_switch (easy | medium | hard | blindbox | funfair), p_on;
--                 a live flip, until the segment changes
drop function if exists public.fn_day2_control(text, text, text, boolean, integer, integer, integer);
create or replace function public.fn_day2_control(
  p_action text,
  p_segment text default null,
  p_switch text default null,
  p_on boolean default null,
  p_segments jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  s public.day2_schedule;
  v_seg text;
  e jsonb;
  v_prev integer := -1;
  v_ids text[] := '{}';
  v_old text[];
  v_n integer;
  v_sw text;
begin
  if not public.is_admin() then raise exception 'PERMISSION_DENIED'; end if;
  select * into s from public.day2_schedule where id = 1 for update;

  if p_action = 'set_segments' then
    if p_segments is null or jsonb_typeof(p_segments) <> 'array' then raise exception 'BAD_SEGMENTS'; end if;
    v_n := jsonb_array_length(p_segments);
    if v_n < 1 or v_n > 8 then raise exception 'BAD_SEGMENTS'; end if;
    for e in select * from jsonb_array_elements(p_segments) loop
      if jsonb_typeof(e) <> 'object'
         or coalesce(e ->> 'id', '') = '' or length(e ->> 'id') > 40
         or length(coalesce(e ->> 'label', '')) > 40
         or (e ->> 'id') = any (v_ids) or (e ->> 'id') = 'off' then
        raise exception 'BAD_SEGMENTS';
      end if;
      v_ids := v_ids || (e ->> 'id');
      if jsonb_typeof(e -> 'start_min') <> 'number' or (e ->> 'start_min')::numeric <> trunc((e ->> 'start_min')::numeric)
         or (e ->> 'start_min')::integer <= v_prev and v_prev >= 0 then
        raise exception 'BAD_SEGMENTS';
      end if;
      if v_prev = -1 and (e ->> 'start_min')::integer <> 0 then raise exception 'BAD_SEGMENTS'; end if;
      v_prev := (e ->> 'start_min')::integer;
      foreach v_sw in array array['easy', 'medium', 'hard', 'blindbox', 'funfair'] loop
        if jsonb_typeof(e -> v_sw) <> 'boolean' then raise exception 'BAD_SEGMENTS'; end if;
      end loop;
    end loop;
    select coalesce(array_agg(x ->> 'id'), '{}') into v_old from jsonb_array_elements(s.segments) x;
    if s.manual_segment is not null
       and (not (s.manual_segment = any (v_ids)) or (select array_agg(i order by i) from unnest(v_old) i)
            is distinct from (select array_agg(i order by i) from unnest(v_ids) i)) then
      raise exception 'SEGMENT_HELD';
    end if;
    update public.day2_schedule set segments = p_segments where id = 1;
    -- a flip belongs to the segment it was made in
    if s.override_segment is not null and public.fn_day2_segment() is distinct from s.override_segment then
      update public.day2_schedule set overrides = '{}', override_segment = null where id = 1;
    end if;
  elsif p_action = 'start_segment' then
    if not exists (select 1 from jsonb_array_elements(s.segments) x where x ->> 'id' = p_segment) then
      raise exception 'UNKNOWN_ACTION';
    end if;
    update public.day2_schedule set manual_segment = p_segment, overrides = '{}', override_segment = null where id = 1;
  elsif p_action = 'auto' then
    update public.day2_schedule set manual_segment = null, overrides = '{}', override_segment = null where id = 1;
  elsif p_action = 'set_switch' then
    if p_switch not in ('easy', 'medium', 'hard', 'blindbox', 'funfair') or p_on is null then raise exception 'UNKNOWN_ACTION'; end if;
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
      'segments', case when p_action = 'set_segments' then p_segments end));
  return public.fn_day2_state();
end;
$$;

revoke all on function public.fn_day2_state() from public;
grant execute on function public.fn_day2_state() to anon, authenticated;
revoke all on function public.fn_day2_control(text, text, text, boolean, jsonb) from public;
grant execute on function public.fn_day2_control(text, text, text, boolean, jsonb) to authenticated;
revoke all on function public.fn_day2_segment() from public;
revoke all on function public.fn_day2_off_reason(text) from public;
revoke all on function public.fn_day2_guard(text) from public;
revoke all on function public.fn_day2_guard_checkin(integer) from public;
grant execute on function public.fn_day2_segment(), public.fn_day2_off_reason(text), public.fn_day2_guard(text),
  public.fn_day2_guard_checkin(integer) to anon, authenticated;

-- ── Patch Start game ────────────────────────────────────────────────────
-- Adds the check as the first statement of fn_manual_checkin, once (same
-- approach as 0102; fn_day2_challenge already calls fn_day2_guard('station'),
-- which now means the caller's own tier).
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
    head := position(E'\nAS ' in def);
    patched := left(def, head) || regexp_replace(substr(def, head + 1), E'\\mbegin\\M', E'begin\n  ' || stmt || E'\n', 'i');
    if patched = def then
      raise notice '0115: % has no plpgsql begin; not patched', f;
      continue;
    end if;
    execute patched;
  end loop;
  if not found then raise notice '0115: % not found; not patched', fn; end if;
end;
$$;

select pg_temp.day2_patch('fn_manual_checkin', 'perform public.fn_day2_guard_checkin(p_station_id);', 'fn_day2_guard_checkin');
