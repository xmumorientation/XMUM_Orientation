-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0047: stations belong to a day; the code is their location
--
-- * stations.day (added in 0012) must be 1 or 2. Admin picks it when adding
--   or editing a station.
-- * stations.code is the station's block and floor (e.g. "A4-1" = block A4,
--   floor 1), not an identifier, so two stations may share it.
-- * fn_day2_challenge refuses at Day 1 stations. (fn_gm_day1_reward in 0046
--   refuses at Day 2 stations.) Unchanged from 0006 otherwise.
-- ═══════════════════════════════════════════════════════════════════════

update public.stations set day = 1 where day is null or day not in (1, 2);

alter table public.stations drop constraint if exists stations_day_check;
alter table public.stations add constraint stations_day_check check (day in (1, 2));

alter table public.stations drop constraint if exists stations_code_key;

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
  -- Day 2 challenges only run at Day 2 stations (migration 0047)
  if v_station.day <> 2 then
    raise exception 'WRONG_DAY_STATION';
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
