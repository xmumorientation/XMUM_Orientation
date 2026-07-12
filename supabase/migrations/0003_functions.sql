-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0003: Server-authoritative game logic (RPCs)
-- Proposal §5.2: ALL token mutations, gacha rolls, grants and activations
-- execute server-side. Every function checks role + kill-switch + phase,
-- is atomic, idempotent where relevant, and writes to audit_log.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Internal helpers ─────────────────────────────────────────────────────

create or replace function public.audit(p_action text, p_target text, p_detail jsonb)
returns void
language sql security definer set search_path = public
as $$
  insert into public.audit_log (actor, actor_role, action, target, detail)
  values (auth.uid(), public.my_role(), p_action, p_target, coalesce(p_detail, '{}'::jsonb));
$$;

create or replace function public.config_bool(p_key text, p_default boolean)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select (value #>> '{}')::boolean from public.game_config where key = p_key), p_default);
$$;

create or replace function public.config_text(p_key text, p_default text)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce((select value #>> '{}' from public.game_config where key = p_key), p_default);
$$;

-- FR-10.3: phase gating with admin rehearsal override
create or replace function public.phase_active(p_key text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.config_bool('rehearsal_mode', false)
      or exists (
           select 1 from public.phases
           where key = p_key and state = 'active'
             and (ends_at is null or ends_at > now())
         );
$$;

-- ── Server clock (FR-10.4) ───────────────────────────────────────────────

create or replace function public.fn_server_time()
returns timestamptz
language sql stable
as $$ select now(); $$;

-- ── Group directory for GM panels (id + name only; no balances) ─────────

create or replace function public.fn_list_groups()
returns table (id integer, name text)
language sql stable security definer set search_path = public
as $$
  select g.id, g.name from public.groups g
  where public.my_role() in ('gm', 'guardian_gm', 'hof', 'hogm', 'committee', 'admin')
  order by g.id;
$$;

-- ── Token economy (FR-5.x) ───────────────────────────────────────────────

create or replace function public.fn_adjust_tokens(
  p_group_id integer,
  p_delta integer,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.user_role := public.my_role();
  v_station integer;
  v_balance integer;
  v_tx_id bigint;
begin
  if v_role not in ('gm', 'guardian_gm', 'hof', 'hogm', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if public.config_bool('tokens_frozen', false) then
    raise exception 'TOKENS_FROZEN';
  end if;
  if p_delta = 0 or abs(p_delta) > 50 then
    raise exception 'INVALID_DELTA';
  end if;
  -- FR-10.3: deductions are a Day 2 mechanic
  if p_delta < 0 and v_role <> 'admin'
     and not (public.phase_active('day2') or public.phase_active('endgame')) then
    raise exception 'PHASE_LOCKED';
  end if;

  -- FR-5.7: idempotency — a retried submission returns the original result
  if p_idempotency_key is not null then
    select id into v_tx_id from public.token_transactions
      where idempotency_key = p_idempotency_key;
    if found then
      select token_balance into v_balance from public.groups where id = p_group_id;
      return jsonb_build_object('ok', true, 'duplicate', true,
                                'transaction_id', v_tx_id, 'balance', v_balance);
    end if;
  end if;

  select station_id into v_station from public.profiles where id = auth.uid();

  -- FR-5.6: atomic mutation; check constraint rejects negative balances
  update public.groups
     set token_balance = token_balance + p_delta
   where id = p_group_id
   returning token_balance into v_balance;

  if not found then
    raise exception 'GROUP_NOT_FOUND';
  end if;

  insert into public.token_transactions (group_id, delta, reason, actor, station_id, idempotency_key)
  values (p_group_id, p_delta, coalesce(p_reason, ''), auth.uid(), v_station, p_idempotency_key)
  returning id into v_tx_id;

  perform public.audit('tokens.adjust', 'group:' || p_group_id,
    jsonb_build_object('delta', p_delta, 'reason', p_reason, 'balance_after', v_balance));

  return jsonb_build_object('ok', true, 'duplicate', false,
                            'transaction_id', v_tx_id, 'balance', v_balance);
exception
  when check_violation then
    raise exception 'INSUFFICIENT_BALANCE';
end;
$$;

-- FR-5.8 (P1): GM reverses their own last transaction within 2 minutes
create or replace function public.fn_undo_last_transaction()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tx record;
  v_balance integer;
  v_undo_id bigint;
begin
  if public.my_role() not in ('gm', 'guardian_gm', 'hof', 'hogm', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;

  select * into v_tx from public.token_transactions
   where actor = auth.uid() and reversed_by is null and reason not like 'UNDO:%'
   order by created_at desc limit 1;

  if not found then
    raise exception 'NOTHING_TO_UNDO';
  end if;
  if v_tx.created_at < now() - interval '2 minutes' then
    raise exception 'UNDO_WINDOW_EXPIRED';
  end if;

  update public.groups
     set token_balance = token_balance - v_tx.delta
   where id = v_tx.group_id
   returning token_balance into v_balance;

  insert into public.token_transactions (group_id, delta, reason, actor, station_id)
  values (v_tx.group_id, -v_tx.delta, 'UNDO: reversal of tx #' || v_tx.id, auth.uid(), v_tx.station_id)
  returning id into v_undo_id;

  update public.token_transactions set reversed_by = v_undo_id where id = v_tx.id;

  perform public.audit('tokens.undo', 'group:' || v_tx.group_id,
    jsonb_build_object('original_tx', v_tx.id, 'undo_tx', v_undo_id));

  return jsonb_build_object('ok', true, 'balance', v_balance, 'reversed_tx', v_tx.id);
exception
  when check_violation then
    raise exception 'UNDO_WOULD_GO_NEGATIVE';
end;
$$;

-- ── Inventory (FR-6.x) ───────────────────────────────────────────────────

create or replace function public.fn_grant_item(
  p_group_id integer,
  p_item_id integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_item record;
  v_inv_id bigint;
begin
  if public.my_role() not in ('gm', 'guardian_gm', 'hof', 'hogm', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;

  if p_idempotency_key is not null then
    select id into v_inv_id from public.inventory where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'duplicate', true, 'inventory_id', v_inv_id);
    end if;
  end if;

  select * into v_item from public.items where id = p_item_id;
  if not found then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  insert into public.inventory (group_id, item_id, item_type, source, granted_by, idempotency_key)
  values (p_group_id, p_item_id, v_item.type, 'gm_grant', auth.uid(), p_idempotency_key)
  returning id into v_inv_id;

  perform public.audit('inventory.grant', 'group:' || p_group_id,
    jsonb_build_object('item_id', p_item_id, 'item_name', v_item.name));

  return jsonb_build_object('ok', true, 'duplicate', false, 'inventory_id', v_inv_id);
exception
  when unique_violation then
    raise exception 'DUPLICATE_PUZZLE_PIECE';
end;
$$;

-- ── Gacha (FR-7.x) ───────────────────────────────────────────────────────
-- Weighted server-side RNG. Locks pool entries FOR UPDATE so the single
-- Gala Night card can never be drawn twice (FR-7.4). Cost + payout + item
-- deposit happen in one transaction (FR-7.6).

create or replace function public.fn_gacha_draw(
  p_group_id integer,
  p_pool_key text,
  p_idempotency_key text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.user_role := public.my_role();
  v_pool record;
  v_entry record;
  v_total numeric;
  v_roll numeric;
  v_acc numeric := 0;
  v_draw_id bigint;
  v_balance integer;
  v_reveal_gala boolean;
  v_is_gala boolean := false;
  v_item record;
begin
  if public.config_bool('gacha_disabled', false) then
    raise exception 'GACHA_DISABLED';
  end if;

  select * into v_pool from public.gacha_pools where key = p_pool_key and enabled;
  if not found then
    raise exception 'POOL_NOT_FOUND';
  end if;
  if not (v_role = any (v_pool.allowed_roles)) then
    raise exception 'PERMISSION_DENIED';
  end if;

  if p_idempotency_key is not null then
    select id into v_draw_id from public.gacha_draws where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'duplicate', true, 'draw_id', v_draw_id);
    end if;
  end if;

  -- Charge the cost atomically (Idea 2 costs 2 tokens)
  if v_pool.cost_tokens > 0 then
    begin
      update public.groups
         set token_balance = token_balance - v_pool.cost_tokens
       where id = p_group_id
       returning token_balance into v_balance;
      if not found then raise exception 'GROUP_NOT_FOUND'; end if;
    exception when check_violation then
      raise exception 'INSUFFICIENT_BALANCE';
    end;
    insert into public.token_transactions (group_id, delta, reason, actor)
    values (p_group_id, -v_pool.cost_tokens, 'Gacha cost: ' || v_pool.name, auth.uid());
  end if;

  -- Lock the pool's entries first (FOR UPDATE can't combine with SUM),
  -- then compute the weight total over the locked snapshot.
  perform 1 from public.gacha_pool_entries
    where pool_id = v_pool.id for update;

  select coalesce(sum(weight), 0) into v_total
    from public.gacha_pool_entries
   where pool_id = v_pool.id and weight > 0 and (remaining is null or remaining > 0);

  if v_total <= 0 then
    raise exception 'POOL_EMPTY';
  end if;

  v_roll := random() * v_total;
  for v_entry in
    select * from public.gacha_pool_entries
     where pool_id = v_pool.id and weight > 0 and (remaining is null or remaining > 0)
     order by id
  loop
    v_acc := v_acc + v_entry.weight;
    exit when v_roll < v_acc;
  end loop;

  if v_entry.remaining is not null then
    update public.gacha_pool_entries set remaining = remaining - 1 where id = v_entry.id;
  end if;

  insert into public.gacha_draws (pool_id, entry_id, group_id, actor, idempotency_key)
  values (v_pool.id, v_entry.id, p_group_id, auth.uid(), p_idempotency_key)
  returning id into v_draw_id;

  -- Deposit results atomically with the draw (FR-7.6)
  if v_pool.bonus_tokens > 0 then
    update public.groups set token_balance = token_balance + v_pool.bonus_tokens
     where id = p_group_id;
    insert into public.token_transactions (group_id, delta, reason, actor)
    values (p_group_id, v_pool.bonus_tokens, 'Gacha bonus: ' || v_pool.name, auth.uid());
  end if;

  if v_entry.kind = 'tokens' and v_entry.token_amount > 0 then
    update public.groups set token_balance = token_balance + v_entry.token_amount
     where id = p_group_id;
    insert into public.token_transactions (group_id, delta, reason, actor)
    values (p_group_id, v_entry.token_amount, 'Gacha win: ' || v_entry.label, auth.uid());
  end if;

  if v_entry.kind in ('facility_card', 'clue') and v_entry.item_id is not null then
    select * into v_item from public.items where id = v_entry.item_id;
    insert into public.inventory (group_id, item_id, item_type, source, granted_by)
    values (p_group_id, v_entry.item_id, v_item.type, 'gacha', auth.uid());
    v_is_gala := coalesce(v_item.is_gala, false);
  end if;

  select token_balance into v_balance from public.groups where id = p_group_id;

  perform public.audit('gacha.draw', 'group:' || p_group_id,
    jsonb_build_object('pool', p_pool_key, 'entry', v_entry.label,
                       'is_gala', v_is_gala, 'draw_id', v_draw_id));

  -- OPEN DECISION D-3 resolved: reveal mode is admin-configurable.
  -- 'hidden' = the group sees a normal card; only admin sees the flag.
  v_reveal_gala := public.config_text('gala_reveal_mode', 'hidden') = 'immediate';

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'draw_id', v_draw_id,
    'kind', v_entry.kind,
    'label', case when v_is_gala and not v_reveal_gala
                  then regexp_replace(v_entry.label, ' \(Gala Night\)', '')
                  else v_entry.label end,
    'token_amount', case when v_entry.kind = 'tokens' then v_entry.token_amount else 0 end,
    'bonus_tokens', v_pool.bonus_tokens,
    'is_gala', v_is_gala and v_reveal_gala,
    'balance', v_balance
  );
end;
$$;

-- ── Puzzle set verification (FR-8.x) ─────────────────────────────────────

-- Guardian GM checks a group's piece status for one location
create or replace function public.fn_puzzle_status(p_group_id integer, p_location public.projector_location)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_pieces integer;
  v_redeemed boolean;
  v_activated boolean;
begin
  if public.my_role() not in ('gm', 'guardian_gm', 'hof', 'hogm', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;

  select count(distinct i.puzzle_index) into v_pieces
    from public.inventory inv
    join public.items i on i.id = inv.item_id
   where inv.group_id = p_group_id and i.type = 'puzzle' and i.puzzle_location = p_location;

  v_redeemed := exists (select 1 from public.puzzle_redemptions
                         where group_id = p_group_id and location = p_location);
  v_activated := exists (select 1 from public.projectors
                          where location = p_location and activated_at is not null);

  return jsonb_build_object('pieces', v_pieces, 'complete', v_pieces >= 3,
                            'redeemed', v_redeemed, 'projector_activated', v_activated);
end;
$$;

-- FR-8.2/8.3: mark a complete set as redeemed and log the physical handover
create or replace function public.fn_redeem_puzzle_set(
  p_group_id integer,
  p_location public.projector_location,
  p_nfc_note text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_status jsonb;
begin
  if public.my_role() not in ('guardian_gm', 'hof', 'hogm', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;

  v_status := public.fn_puzzle_status(p_group_id, p_location);
  if not (v_status ->> 'complete')::boolean then
    raise exception 'SET_INCOMPLETE';
  end if;
  if (v_status ->> 'projector_activated')::boolean then
    raise exception 'PROJECTOR_ALREADY_ACTIVATED';
  end if;

  insert into public.puzzle_redemptions (group_id, location, redeemed_by, nfc_note)
  values (p_group_id, p_location, auth.uid(), coalesce(p_nfc_note, ''));

  perform public.audit('puzzle.redeem', 'group:' || p_group_id,
    jsonb_build_object('location', p_location, 'nfc_note', p_nfc_note));

  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    raise exception 'ALREADY_REDEEMED';
end;
$$;

-- ── NFC activation (FR-9.x) ──────────────────────────────────────────────
-- Called from the /activate route AFTER HMAC signature verification.
-- Validates: token unused ∧ set redeemed by this group ∧ projector free
-- ∧ endgame phase (or rehearsal). One group ↔ one projector via constraints.

create or replace function public.fn_activate_projector(p_token_hash text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_group integer := public.my_group_id();
  v_token record;
  v_proj record;
begin
  if public.config_bool('nfc_disabled', false) then
    raise exception 'NFC_DISABLED';
  end if;
  if v_group is null then
    raise exception 'NOT_IN_GROUP';
  end if;
  if not public.phase_active('endgame') then
    raise exception 'NOT_ENDGAME';
  end if;

  select * into v_token from public.nfc_tokens
   where token_hash = p_token_hash for update;
  if not found then
    raise exception 'TOKEN_UNKNOWN';
  end if;
  if v_token.used_at is not null then
    raise exception 'TOKEN_USED';
  end if;

  if not exists (select 1 from public.puzzle_redemptions
                  where group_id = v_group and location = v_token.location) then
    raise exception 'SET_NOT_REDEEMED';
  end if;

  select * into v_proj from public.projectors
   where location = v_token.location for update;
  if v_proj.activated_at is not null then
    raise exception 'ALREADY_ACTIVATED';
  end if;

  -- unique(activated_by_group) also blocks a group activating two projectors
  update public.projectors
     set activated_by_group = v_group, activated_at = now(), activated_manually = false
   where location = v_token.location;

  update public.nfc_tokens
     set used_at = now(), used_by_group = v_group
   where id = v_token.id;

  perform public.audit('projector.activate', 'projector:' || v_token.location,
    jsonb_build_object('group_id', v_group, 'token_id', v_token.id));

  return jsonb_build_object('ok', true, 'location', v_token.location, 'group_id', v_group);
exception
  when unique_violation then
    raise exception 'GROUP_ALREADY_ACTIVATED_ONE';
end;
$$;

-- FR-9.5: manual override when a sticker is damaged
create or replace function public.fn_activate_projector_manual(
  p_location public.projector_location,
  p_group_id integer
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if public.my_role() not in ('guardian_gm', 'hogm', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not exists (select 1 from public.puzzle_redemptions
                  where group_id = p_group_id and location = p_location) then
    raise exception 'SET_NOT_REDEEMED';
  end if;

  update public.projectors
     set activated_by_group = p_group_id, activated_at = now(), activated_manually = true
   where location = p_location and activated_at is null;
  if not found then
    raise exception 'ALREADY_ACTIVATED';
  end if;

  perform public.audit('projector.activate_manual', 'projector:' || p_location,
    jsonb_build_object('group_id', p_group_id));

  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    raise exception 'GROUP_ALREADY_ACTIVATED_ONE';
end;
$$;

-- ── Station status (FR-4.2) ──────────────────────────────────────────────

create or replace function public.fn_set_station_status(
  p_station_id integer,
  p_status public.station_status
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.user_role := public.my_role();
  v_own integer;
begin
  if v_role in ('hof', 'hogm', 'admin') then
    null; -- may toggle any station
  elsif v_role in ('gm', 'guardian_gm') then
    select station_id into v_own from public.profiles where id = auth.uid();
    if v_own is distinct from p_station_id then
      raise exception 'NOT_YOUR_STATION';
    end if;
  else
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.stations set status = p_status where id = p_station_id;
  if not found then raise exception 'STATION_NOT_FOUND'; end if;

  perform public.audit('station.status', 'station:' || p_station_id,
    jsonb_build_object('status', p_status));
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Location tracking (FR-3.x) ───────────────────────────────────────────

create or replace function public.fn_manual_checkin(p_station_id integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_group integer := public.my_group_id();
begin
  if public.my_role() not in ('faci', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if v_group is null then
    raise exception 'NOT_IN_GROUP';
  end if;

  insert into public.group_locations (group_id, source, station_id, reported_by)
  values (v_group, 'manual', p_station_id, auth.uid());

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fn_report_gps(
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_group integer := public.my_group_id();
begin
  if public.my_role() <> 'faci' then
    raise exception 'PERMISSION_DENIED';
  end if;
  if v_group is null then
    raise exception 'NOT_IN_GROUP';
  end if;

  insert into public.group_locations (group_id, source, lat, lng, accuracy_m, reported_by)
  values (v_group, 'gps', p_lat, p_lng, p_accuracy, auth.uid());

  return jsonb_build_object('ok', true);
end;
$$;

-- Latest location per group for the committee map (and Faci's own group)
create or replace function public.fn_latest_locations()
returns table (
  group_id integer, group_name text, source public.location_source,
  station_id integer, station_name text, lat double precision, lng double precision,
  accuracy_m double precision, reported_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select distinct on (gl.group_id)
         gl.group_id, g.name, gl.source, gl.station_id, s.name,
         gl.lat, gl.lng, gl.accuracy_m, gl.created_at
    from public.group_locations gl
    join public.groups g on g.id = gl.group_id
    left join public.stations s on s.id = gl.station_id
   where public.is_committee() or gl.group_id = public.my_group_id()
   order by gl.group_id, gl.created_at desc;
$$;

-- ── Attendance (FR-2.x) ──────────────────────────────────────────────────

create or replace function public.fn_mark_attendance(
  p_session_id integer,
  p_freshie_id uuid,
  p_status public.attendance_status
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.user_role := public.my_role();
  v_freshie_group integer;
begin
  if v_role not in ('faci', 'hof', 'hogm', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;
  -- FR-2.4: closed sessions are immutable except for Admin
  if v_role <> 'admin' and exists (
    select 1 from public.attendance_sessions where id = p_session_id and closed
  ) then
    raise exception 'SESSION_CLOSED';
  end if;

  select group_id into v_freshie_group from public.profiles where id = p_freshie_id;
  if v_freshie_group is null then
    raise exception 'FRESHIE_HAS_NO_GROUP';
  end if;
  if v_role = 'faci' and v_freshie_group is distinct from public.my_group_id() then
    raise exception 'NOT_YOUR_GROUP';
  end if;

  insert into public.attendance_records (session_id, freshie_id, group_id, status, marked_by)
  values (p_session_id, p_freshie_id, v_freshie_group, p_status, auth.uid())
  on conflict (session_id, freshie_id)
  do update set status = excluded.status, marked_by = excluded.marked_by, marked_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fn_record_headcount(p_session_id integer, p_count integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_group integer := public.my_group_id();
begin
  if public.my_role() not in ('faci', 'hof', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if v_group is null then
    raise exception 'NOT_IN_GROUP';
  end if;
  if exists (select 1 from public.attendance_sessions where id = p_session_id and closed)
     and public.my_role() <> 'admin' then
    raise exception 'SESSION_CLOSED';
  end if;

  insert into public.attendance_headcounts (session_id, group_id, headcount, marked_by)
  values (p_session_id, v_group, p_count, auth.uid())
  on conflict (session_id, group_id)
  do update set headcount = excluded.headcount, marked_by = excluded.marked_by, marked_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

-- ── Phase control (FR-10.1) ──────────────────────────────────────────────

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
  if not public.is_admin() then
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

-- ── Config / kill-switches (FR-11.5) ─────────────────────────────────────

create or replace function public.fn_set_config(p_key text, p_value jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
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

-- ── Admin group assignment (FR-1.3 / FR-12.1, D-4: both paths) ──────────

create or replace function public.fn_assign_group(p_user_id uuid, p_group_id integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if public.my_role() not in ('committee', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;
  update public.profiles set group_id = p_group_id where id = p_user_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  perform public.audit('user.assign_group', 'user:' || p_user_id,
    jsonb_build_object('group_id', p_group_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- Admin edits to role/group/station — direct column updates are revoked
-- (see 0002) so self-escalation via PATCH is impossible.
create or replace function public.fn_admin_update_profile(
  p_user_id uuid,
  p_role public.user_role,
  p_group_id integer,
  p_station_id integer
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  update public.profiles
     set role = p_role, group_id = p_group_id, station_id = p_station_id
   where id = p_user_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  perform public.audit('user.update', 'user:' || p_user_id,
    jsonb_build_object('role', p_role, 'group_id', p_group_id, 'station_id', p_station_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- Register-counter lookup by student id or name (committee tier)
create or replace function public.fn_lookup_freshie(p_query text)
returns table (id uuid, full_name text, student_id text, email text, group_id integer)
language sql stable security definer set search_path = public
as $$
  select p.id, p.full_name, p.student_id, p.email, p.group_id
    from public.profiles p
   where public.my_role() in ('committee', 'admin')
     and p.role = 'freshie'
     and (p.student_id ilike '%' || p_query || '%'
          or p.full_name ilike '%' || p_query || '%'
          or p.email ilike '%' || p_query || '%')
   order by p.full_name
   limit 20;
$$;

-- ── Live ops snapshot (FR-11.6) ──────────────────────────────────────────

create or replace function public.fn_live_ops()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v jsonb;
begin
  if public.my_role() not in ('hof', 'hogm', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;
  select jsonb_build_object(
    'tokens_in_circulation', (select coalesce(sum(token_balance), 0) from public.groups),
    'transactions_count',    (select count(*) from public.token_transactions),
    'draws_count',           (select count(*) from public.gacha_draws),
    'sets_redeemed',         (select count(*) from public.puzzle_redemptions),
    'projectors_activated',  (select count(*) from public.projectors where activated_at is not null),
    'gala_drawn_by', (
      select g.name from public.gacha_draws d
        join public.gacha_pool_entries e on e.id = d.entry_id
        join public.items i on i.id = e.item_id
        join public.groups g on g.id = d.group_id
       where i.is_gala limit 1
    )
  ) into v;
  return v;
end;
$$;
