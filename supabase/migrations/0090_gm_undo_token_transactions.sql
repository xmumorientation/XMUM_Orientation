-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0090: the GM's Undo reads token_transactions again
--
-- The live database runs bonding-session's fn_undo_last_transaction
-- (bonding-session 0035), which looks for the caller's last row in
-- token_logs. The GM Station page records its results with
-- fn_gm_day1_reward / fn_day2_challenge (0046 / 0047), which write
-- token_transactions, so Undo never finds them and answers NOTHING_TO_UNDO
-- (checked on the live database, 2026-10-20).
--
-- This puts back 0003's version, which reads token_transactions, with these
-- changes:
--   * the window is Admin's game_config "undo_window_minutes" (Admin →
--     Token page), 1 to 120, default 10. It was a fixed 2 minutes.
--   * bonding-session's undo rows ("Quick undo of ...") are skipped like
--     "UNDO:" rows, so an old undo is never undone;
--   * a Day 2 entry cannot be undone (UNDO_DAY2_NOT_ALLOWED): it would refund
--     the fee but keep the piece the win granted. Admin corrects those.
--   * fn_undo_preview(): what Undo would reverse, for the GM page's confirm
--     sheet. It reads the same row (fn_undo_candidate) and changes nothing.
-- fn_undo_last_transaction keeps its signature, so CREATE OR REPLACE keeps
-- its grants. Run it inside begin; ... commit;.
-- ═══════════════════════════════════════════════════════════════════════

-- Minutes a GM may undo their last transaction: game_config
-- "undo_window_minutes", a whole number from 1 to 120, else 10.
create or replace function public.fn_undo_window_minutes()
returns integer
language sql stable security definer set search_path = public
as $$
  select case
    when v ~ '^[0-9]{1,3}$' then least(greatest(v::integer, 1), 120)
    else 10
  end
  from (select public.config_text('undo_window_minutes', '10') as v) c;
$$;

-- The caller's last transaction Undo would reverse (not reversed yet, not an
-- undo itself), or nothing.
create or replace function public.fn_undo_candidate()
returns setof public.token_transactions
language sql stable security definer set search_path = public
as $$
  select * from public.token_transactions
   where actor = auth.uid()
     and reversed_by is null
     and reason not like 'UNDO:%'
     and reason not like 'Quick undo of%'
   order by created_at desc
   limit 1;
$$;

create or replace function public.fn_undo_last_transaction()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tx public.token_transactions;
  v_balance integer;
  v_undo_id bigint;
begin
  if public.my_role() not in ('gm', 'guardian_gm', 'hof', 'hogm', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;

  select t.* into v_tx
    from public.token_transactions t
   where t.id = (select c.id from public.fn_undo_candidate() c)
   for update;

  if not found then
    raise exception 'NOTHING_TO_UNDO';
  end if;
  if v_tx.created_at < now() - make_interval(mins => public.fn_undo_window_minutes()) then
    raise exception 'UNDO_WINDOW_EXPIRED';
  end if;
  if v_tx.reason like 'Day 2 entry%' then
    raise exception 'UNDO_DAY2_NOT_ALLOWED';
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

-- What Undo would reverse right now. found = false when there is nothing;
-- undoable = false with a reason (UNDO_WINDOW_EXPIRED, UNDO_DAY2_NOT_ALLOWED)
-- when there is a row but Undo would refuse it.
create or replace function public.fn_undo_preview()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_tx public.token_transactions;
  v_window integer := public.fn_undo_window_minutes();
  v_why text;
begin
  if public.my_role() not in ('gm', 'guardian_gm', 'hof', 'hogm', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;

  select * into v_tx from public.fn_undo_candidate();
  if not found then
    return jsonb_build_object('found', false, 'window_minutes', v_window);
  end if;

  v_why := case
    when v_tx.created_at < now() - make_interval(mins => v_window) then 'UNDO_WINDOW_EXPIRED'
    when v_tx.reason like 'Day 2 entry%' then 'UNDO_DAY2_NOT_ALLOWED'
  end;

  return jsonb_build_object(
    'found', true,
    'undoable', v_why is null,
    'why', v_why,
    'id', v_tx.id,
    'group_id', v_tx.group_id,
    'group_name', (select g.name from public.groups g where g.id = v_tx.group_id),
    'delta', v_tx.delta,
    'reason', v_tx.reason,
    'created_at', v_tx.created_at,
    'expires_at', v_tx.created_at + make_interval(mins => v_window),
    'window_minutes', v_window
  );
end;
$$;

revoke all on function public.fn_undo_window_minutes() from public, anon;
revoke all on function public.fn_undo_candidate() from public, anon, authenticated;
revoke all on function public.fn_undo_preview() from public, anon;
grant execute on function public.fn_undo_window_minutes() to authenticated;
grant execute on function public.fn_undo_preview() to authenticated;
