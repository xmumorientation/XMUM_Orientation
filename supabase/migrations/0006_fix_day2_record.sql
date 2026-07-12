-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0006: hotfix for fn_day2_challenge
--
-- Bug: v_item was declared as a bare `record`, which has no known column
-- structure until assigned. On a LOSING Day 2 submission (p_success =
-- false), v_item is never assigned — but the function still references
-- v_item.name / .puzzle_location / .puzzle_index inside CASE WHEN
-- expressions for the audit log and the return value. PL/pgSQL raises
-- "record ... is not assigned yet" the moment an unassigned bare record's
-- field is referenced, even inside a branch that logically shouldn't run.
-- Fix: declare v_item as `public.items%rowtype` instead, which has a
-- fixed, all-NULL structure from declaration — safe to reference even
-- when never populated. This migration only re-defines the function
-- (CREATE OR REPLACE); no data changes.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_day2_challenge(
  p_group_id integer,
  p_success boolean,
  p_locations public.projector_location[],
  p_idempotency_key text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.user_role := public.my_role();
  v_station record;
  v_pool public.projector_location[];
  -- typed %rowtype (not a bare `record`) so it has a known, all-NULL
  -- structure even when p_success is false and it's never assigned —
  -- referencing fields of an unassigned bare `record` raises
  -- "record ... is not assigned yet" even inside a CASE WHEN that
  -- shouldn't evaluate that branch.
  v_item public.items%rowtype;
  v_balance integer;
  v_tx_id bigint;
begin
  if v_role not in ('gm', 'guardian_gm', 'hof', 'hogm', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if public.config_bool('tokens_frozen', false) then
    raise exception 'TOKENS_FROZEN';
  end if;
  if v_role <> 'admin'
     and not (public.phase_active('day2') or public.phase_active('endgame')) then
    raise exception 'PHASE_LOCKED';
  end if;

  -- idempotency (double-tap / offline retry)
  if p_idempotency_key is not null then
    select id into v_tx_id from public.token_transactions
      where idempotency_key = p_idempotency_key;
    if found then
      select token_balance into v_balance from public.groups where id = p_group_id;
      return jsonb_build_object('ok', true, 'duplicate', true, 'balance', v_balance);
    end if;
  end if;

  -- the GM's own station decides tier & cost (admins may pass any station via profile)
  select s.* into v_station
    from public.stations s
    join public.profiles p on p.station_id = s.id
   where p.id = auth.uid();
  if not found then
    raise exception 'NO_STATION_ASSIGNED';
  end if;

  -- location pool per tier
  if v_station.risk_tier = 'low' then
    v_pool := array['B1','A3','TF']::public.projector_location[];
  elsif v_station.risk_tier = 'medium' then
    if p_locations is null or array_length(p_locations, 1) <> 2 then
      raise exception 'NEED_TWO_LOCATIONS';
    end if;
    v_pool := p_locations;
  else
    if p_locations is null or array_length(p_locations, 1) <> 1 then
      raise exception 'NEED_ONE_LOCATION';
    end if;
    v_pool := p_locations;
  end if;

  -- on success, make sure the pool still has an unowned piece BEFORE charging
  if p_success then
    select i.* into v_item
      from public.items i
     where i.type = 'puzzle'
       and i.puzzle_location = any (v_pool)
       and not exists (
         select 1 from public.inventory inv
          where inv.group_id = p_group_id and inv.item_id = i.id
       )
     order by random()
     limit 1;
    if not found then
      raise exception 'POOL_EXHAUSTED';
    end if;
  end if;

  -- charge the entry fee (win or lose)
  begin
    update public.groups
       set token_balance = token_balance - v_station.entry_cost
     where id = p_group_id
     returning token_balance into v_balance;
    if not found then raise exception 'GROUP_NOT_FOUND'; end if;
  exception when check_violation then
    raise exception 'INSUFFICIENT_BALANCE';
  end;

  insert into public.token_transactions (group_id, delta, reason, actor, station_id, idempotency_key)
  values (p_group_id, -v_station.entry_cost,
          'Day 2 entry: ' || v_station.name || ' (' || v_station.risk_tier || ')',
          auth.uid(), v_station.id, p_idempotency_key)
  returning id into v_tx_id;

  if p_success then
    insert into public.inventory (group_id, item_id, item_type, source, granted_by)
    values (p_group_id, v_item.id, 'puzzle', 'gm_grant', auth.uid());
  end if;

  perform public.audit('day2.challenge', 'group:' || p_group_id,
    jsonb_build_object('station', v_station.id, 'tier', v_station.risk_tier,
                       'cost', v_station.entry_cost, 'success', p_success,
                       'piece', case when p_success then v_item.name end));

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'balance', v_balance,
    'success', p_success, 'cost', v_station.entry_cost,
    'piece_name', case when p_success then v_item.name end,
    'piece_location', case when p_success then v_item.puzzle_location::text end,
    'piece_index', case when p_success then v_item.puzzle_index end
  );
end;
$$;
