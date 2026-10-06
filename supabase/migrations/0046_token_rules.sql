-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0046: one set of token rules for the whole game
--
-- Before this, the token amounts lived in three places that did not talk
-- to each other: admin presets (saved to the wrong column, so they only
-- lived in one browser), game_config_rules, and hardcoded +2 / +1 on the
-- GM page. Day 2 fees came from a free per-station number.
--
-- After this:
--   * game_config_rules holds the five token rules. Only admin can change
--     them (Token page, /admin/token).
--   * GM Day 1 rewards read the amount from the rules on the server
--     (fn_gm_day1_reward). The GM cannot choose an amount.
--   * Day 2 entry fee is set per tier. stations.entry_cost is kept equal to
--     the tier's rule, so fn_day2_challenge and every screen that shows
--     entry_cost stay correct without changes.
--   * groups.current_tokens is kept equal to groups.token_balance, so the
--     Token page's log edits never work from a stale balance.
--   * Free-amount token changes (fn_adjust_tokens, fn_manual_token_adjust)
--     are dropped; unused open token RPCs are no longer callable.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. The rules ────────────────────────────────────────────────────────

insert into public.game_config_rules (day, rule_key, rule_value, description)
values
  (1, 'DAY1_WIN_TOKENS',  2, 'Day 1: tokens for the winning group'),
  (1, 'DAY1_LOSE_TOKENS', 1, 'Day 1: tokens for the losing / participating group'),
  (2, 'EASY_COST',        2, 'Day 2: entry fee for Easy (low risk) stations'),
  (2, 'MEDIUM_COST',      4, 'Day 2: entry fee for Medium stations'),
  (2, 'HARD_COST',        6, 'Day 2: entry fee for Hard (high risk) stations')
on conflict (rule_key) do nothing;

-- The old preset list (a JSON blob) is replaced by the rules above.
delete from public.game_config_rules where rule_key = 'APP_TOKEN_PRESETS_JSON';

create or replace function public.fn_token_rule(p_key text, p_default integer)
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select rule_value from public.game_config_rules where rule_key = p_key),
    p_default
  );
$$;

create or replace function public.fn_tier_entry_cost(p_tier public.risk_tier)
returns integer
language sql stable security definer set search_path = public
as $$
  select case p_tier
    when 'low'    then public.fn_token_rule('EASY_COST', 2)
    when 'medium' then public.fn_token_rule('MEDIUM_COST', 4)
    when 'high'   then public.fn_token_rule('HARD_COST', 6)
  end;
$$;

-- Admin-only rule editor. Replaces the open 0012 version.
create or replace function public.fn_update_game_config_rule(
  p_rule_key   varchar(100),
  p_rule_value integer
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
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

revoke all on function public.fn_update_game_config_rule(varchar, integer) from public, anon;
grant execute on function public.fn_update_game_config_rule(varchar, integer) to authenticated;

-- Everyone may read the rules; only admin may write them directly.
drop policy if exists "allow all insert on game_config_rules" on public.game_config_rules;
drop policy if exists "allow all update on game_config_rules" on public.game_config_rules;
drop policy if exists "allow all delete on game_config_rules" on public.game_config_rules;
drop policy if exists "admin writes game_config_rules" on public.game_config_rules;
create policy "admin writes game_config_rules" on public.game_config_rules
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 2. Day 2 entry fee follows the tier ─────────────────────────────────

create or replace function public.trg_station_entry_cost()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.entry_cost := public.fn_tier_entry_cost(new.risk_tier);
  return new;
end;
$$;

drop trigger if exists station_entry_cost on public.stations;
create trigger station_entry_cost
  before insert or update of risk_tier, entry_cost on public.stations
  for each row execute function public.trg_station_entry_cost();

create or replace function public.trg_rules_sync_station_cost()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.rule_key in ('EASY_COST', 'MEDIUM_COST', 'HARD_COST') then
    update public.stations
       set entry_cost = new.rule_value
     where risk_tier = case new.rule_key
                         when 'EASY_COST'   then 'low'::public.risk_tier
                         when 'MEDIUM_COST' then 'medium'::public.risk_tier
                         else 'high'::public.risk_tier
                       end;
  end if;
  return new;
end;
$$;

drop trigger if exists rules_sync_station_cost on public.game_config_rules;
create trigger rules_sync_station_cost
  after insert or update of rule_value on public.game_config_rules
  for each row execute function public.trg_rules_sync_station_cost();

-- Bring existing stations in line with the rules now.
update public.stations set entry_cost = public.fn_tier_entry_cost(risk_tier);

-- ── 3. One balance column ───────────────────────────────────────────────
-- GM functions update token_balance; the 0012 admin functions read
-- current_tokens. Keep them equal so neither side works from a stale value.

create or replace function public.trg_groups_sync_balance()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.current_tokens := new.token_balance;
  elsif new.token_balance is distinct from old.token_balance then
    new.current_tokens := new.token_balance;
  elsif new.current_tokens is distinct from old.current_tokens then
    new.token_balance := new.current_tokens;
  end if;
  return new;
end;
$$;

drop trigger if exists groups_sync_balance on public.groups;
create trigger groups_sync_balance
  before insert or update on public.groups
  for each row execute function public.trg_groups_sync_balance();

-- token_balance is what GMs, the scoreboard and Freshie Home use.
update public.groups
   set current_tokens = token_balance
 where current_tokens is distinct from token_balance;

-- ── 4. GM Day 1 reward: amount comes from the rules ─────────────────────

create or replace function public.fn_gm_day1_reward(
  p_group_id integer,
  p_result text,               -- 'win' or 'lose'
  p_idempotency_key text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.user_role := public.my_role();
  v_delta integer;
  v_reason text;
  v_station integer;
  v_station_day integer;
  v_balance integer;
  v_tx_id bigint;
begin
  if v_role not in ('gm', 'guardian_gm', 'hof', 'hogm', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if public.config_bool('tokens_frozen', false) then
    raise exception 'TOKENS_FROZEN';
  end if;

  -- Day 1 rewards only at Day 1 stations (staff without a station may still award)
  select s.day into v_station_day
    from public.profiles p join public.stations s on s.id = p.station_id
   where p.id = auth.uid();
  if v_station_day = 2 then
    raise exception 'WRONG_DAY_STATION';
  end if;

  if p_result = 'win' then
    v_delta := public.fn_token_rule('DAY1_WIN_TOKENS', 2);
    v_reason := 'Day 1 station win';
  elsif p_result = 'lose' then
    v_delta := public.fn_token_rule('DAY1_LOSE_TOKENS', 1);
    v_reason := 'Day 1 station participation';
  else
    raise exception 'INVALID_RESULT';
  end if;

  -- idempotency (double-tap / offline retry)
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

  update public.groups
     set token_balance = token_balance + v_delta
   where id = p_group_id
   returning token_balance into v_balance;
  if not found then
    raise exception 'GROUP_NOT_FOUND';
  end if;

  insert into public.token_transactions (group_id, delta, reason, actor, station_id, idempotency_key)
  values (p_group_id, v_delta, v_reason, auth.uid(), v_station, p_idempotency_key)
  returning id into v_tx_id;

  perform public.audit('tokens.day1_reward', 'group:' || p_group_id,
    jsonb_build_object('result', p_result, 'delta', v_delta, 'balance_after', v_balance));

  return jsonb_build_object('ok', true, 'duplicate', false, 'transaction_id', v_tx_id,
                            'delta', v_delta, 'balance', v_balance);
end;
$$;

revoke all on function public.fn_gm_day1_reward(integer, text, text) from public, anon;
grant execute on function public.fn_gm_day1_reward(integer, text, text) to authenticated;

-- ── 5. Close the other ways to change tokens ────────────────────────────

-- Free-amount token changes are gone. Tokens change only through the GM
-- Station page (fn_gm_day1_reward, fn_day2_challenge, blind box, undo).
-- fn_adjust_tokens was the old GM free-amount call; fn_manual_token_adjust
-- was the admin Manual Adjust on the Token page.
drop function if exists public.fn_adjust_tokens(integer, integer, text, text);
drop function if exists public.fn_manual_token_adjust(integer, integer, varchar, text);

-- Unused since the GM page uses fn_gm_day1_reward / fn_day2_challenge.
-- They had no role check, so anyone with the anon key could give tokens.
revoke all on function public.fn_day1_record_result(integer, integer, integer, text) from public, anon, authenticated;
revoke all on function public.fn_day2_deduct_entry(integer, integer, integer, text) from public, anon, authenticated;
revoke all on function public.fn_day2_award_piece(integer, integer, varchar, integer) from public, anon, authenticated;
