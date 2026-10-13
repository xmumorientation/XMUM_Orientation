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
-- The functions below are the latest versions (0003, 0046, 0056, 0065,
-- 0066) with only the permission check changed from is_admin() to
-- is_game_lead(). fn_set_config also lets HOGM set puzzle_image_* keys.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Helper ──────────────────────────────────────────────────────────────

create or replace function public.is_game_lead()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.my_role() in ('hogm', 'admin'), false);
$$;

-- ── Game phases (from 0003) ─────────────────────────────────────────────

create or replace function public.fn_phase_control(
  p_phase_key text,
  p_action text,            -- start | pause | resume | end | extend
  p_extend_minutes integer default 0
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_phase record;
begin
  if not public.is_game_lead() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select * into v_phase from public.phases where key = p_phase_key for update;
  if not found then raise exception 'PHASE_NOT_FOUND'; end if;

  if p_action = 'start' then
    update public.phases
       set state = 'active', started_at = now(),
           ends_at = now() + (duration_minutes || ' minutes')::interval,
           paused_remaining = null
     where id = v_phase.id;
  elsif p_action = 'pause' then
    if v_phase.state <> 'active' then raise exception 'NOT_ACTIVE'; end if;
    update public.phases
       set state = 'paused',
           paused_remaining = greatest(0, extract(epoch from (v_phase.ends_at - now()))::integer)
     where id = v_phase.id;
  elsif p_action = 'resume' then
    if v_phase.state <> 'paused' then raise exception 'NOT_PAUSED'; end if;
    update public.phases
       set state = 'active',
           ends_at = now() + (coalesce(v_phase.paused_remaining, 0) || ' seconds')::interval,
           paused_remaining = null
     where id = v_phase.id;
  elsif p_action = 'end' then
    update public.phases set state = 'ended', paused_remaining = null where id = v_phase.id;
  elsif p_action = 'extend' then
    if v_phase.state <> 'active' then raise exception 'NOT_ACTIVE'; end if;
    update public.phases
       set ends_at = ends_at + (p_extend_minutes || ' minutes')::interval
     where id = v_phase.id;
  else
    raise exception 'UNKNOWN_ACTION';
  end if;

  perform public.audit('phase.' || p_action, 'phase:' || p_phase_key,
    jsonb_build_object('extend_minutes', p_extend_minutes));

  return jsonb_build_object('ok', true);
end;
$$;

-- Game length before Start: HOGM may update phases (not insert or delete).
drop policy if exists "game lead updates phases" on public.phases;
create policy "game lead updates phases" on public.phases
  for update using (public.is_game_lead()) with check (public.is_game_lead());

-- ── Config (from 0003): HOGM only for puzzle pictures ───────────────────

create or replace function public.fn_set_config(p_key text, p_value jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not (public.is_admin()
          or (public.is_game_lead() and p_key like 'puzzle\_image\_%')) then
    raise exception 'PERMISSION_DENIED';
  end if;

  insert into public.game_config (key, value, updated_by)
  values (p_key, p_value, auth.uid())
  on conflict (key) do update set value = excluded.value,
    updated_by = excluded.updated_by, updated_at = now();

  perform public.audit('config.set', 'config:' || p_key, jsonb_build_object('value', p_value));
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Token rules (from 0046) ─────────────────────────────────────────────

create or replace function public.fn_update_game_config_rule(
  p_rule_key   varchar(100),
  p_rule_value integer
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_game_lead() then
    raise exception 'PERMISSION_DENIED';
  end if;

  if p_rule_key in ('DAY1_WIN_TOKENS', 'DAY1_LOSE_TOKENS') then
    -- same bounds as a single GM token adjustment
    if p_rule_value is null or p_rule_value < 1 or p_rule_value > 50 then
      raise exception 'Day 1 rewards must be between 1 and 50 tokens.';
    end if;
  elsif p_rule_key in ('EASY_COST', 'MEDIUM_COST', 'HARD_COST') then
    if p_rule_value is null or p_rule_value < 0 or p_rule_value > 50 then
      raise exception 'Day 2 entry fees must be between 0 and 50 tokens.';
    end if;
  elsif p_rule_value is null then
    raise exception 'Rule value is required.';
  end if;

  insert into public.game_config_rules (rule_key, rule_value, updated_at)
  values (p_rule_key, p_rule_value, now())
  on conflict (rule_key) do update
  set rule_value = excluded.rule_value,
      updated_at = now();

  perform public.audit('token_rule.update', 'rule:' || p_rule_key,
    jsonb_build_object('value', p_rule_value));

  return jsonb_build_object('ok', true, 'rule_key', p_rule_key, 'rule_value', p_rule_value);
end;
$$;

-- ── Reset tokens and puzzles (from 0056), still Rehearsal mode only ─────

create or replace function public.fn_reset_tokens_and_puzzles()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_logs integer;
  v_pieces integer;
  v_groups integer;
begin
  if not public.is_game_lead() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not public.config_bool('rehearsal_mode', false) then
    raise exception 'TOKEN_RESET_LOCKED';
  end if;

  -- "where true": some Supabase setups refuse a DELETE/UPDATE with no WHERE.
  delete from public.puzzle_inventory where true;
  get diagnostics v_pieces = row_count;
  delete from public.token_logs where true;
  get diagnostics v_logs = row_count;
  update public.groups set current_tokens = 0, token_balance = 0 where true;
  get diagnostics v_groups = row_count;

  perform public.audit('tokens.reset', 'tokens',
    jsonb_build_object('logs_deleted', v_logs, 'pieces_deleted', v_pieces,
                       'groups_zeroed', v_groups));

  return jsonb_build_object('ok', true, 'logs_deleted', v_logs,
    'pieces_deleted', v_pieces, 'groups_zeroed', v_groups);
end;
$$;

-- ── Stations ────────────────────────────────────────────────────────────

drop policy if exists "admin manages stations" on public.stations;
drop policy if exists "game lead manages stations" on public.stations;
create policy "game lead manages stations" on public.stations
  for all using (public.is_game_lead()) with check (public.is_game_lead());

-- Game Masters per station (from 0065)
create or replace function public.fn_admin_station_gms()
returns table (user_id uuid, station_id integer, day integer)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_game_lead() then
    raise exception 'PERMISSION_DENIED';
  end if;
  return query
    select a.user_id, a.station_id, a.day from public.gm_station_assignments a;
end;
$$;

-- Set a station's Game Masters in one call (from 0066)
create or replace function public.fn_admin_set_station_gms(p_station_id integer, p_user_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_day integer;
  v_ids uuid[] := coalesce(p_user_ids, '{}');
begin
  if not public.is_game_lead() then
    raise exception 'PERMISSION_DENIED';
  end if;
  select day into v_day from public.stations where id = p_station_id;
  if not found then
    raise exception 'STATION_NOT_FOUND';
  end if;
  if exists (
    select 1 from unnest(v_ids) u
     where not exists (
       select 1 from public.profiles p
        where p.id = u and p.role in ('gm', 'guardian_gm'))
  ) then
    raise exception 'NOT_A_GAME_MASTER';
  end if;

  delete from public.gm_station_assignments
   where station_id = p_station_id and not (user_id = any (v_ids));

  insert into public.gm_station_assignments (user_id, day, station_id, created_by, updated_by)
  select u, v_day, p_station_id, auth.uid(), auth.uid() from unnest(v_ids) u
  on conflict (user_id, day) do update
    set station_id = excluded.station_id, updated_by = auth.uid()
    where public.gm_station_assignments.station_id is distinct from excluded.station_id;

  perform public.audit('station.gm_set', 'station:' || p_station_id,
    jsonb_build_object('day', v_day, 'user_ids', v_ids));
  return jsonb_build_object('ok', true);
end;
$$;

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
