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
-- This puts back 0003's version, which reads token_transactions, with two
-- changes:
--   * bonding-session's undo rows ("Quick undo of ...") are skipped like
--     "UNDO:" rows, so an old undo is never undone;
--   * a Day 2 entry cannot be undone (UNDO_DAY2_NOT_ALLOWED): it would refund
--     the fee but keep the piece the win granted. Admin corrects those.
-- Same signature, so CREATE OR REPLACE keeps the existing grants.
-- Run it inside begin; ... commit;.
-- ═══════════════════════════════════════════════════════════════════════

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
   where actor = auth.uid()
     and reversed_by is null
     and reason not like 'UNDO:%'
     and reason not like 'Quick undo of%'
   order by created_at desc
   limit 1
   for update;

  if not found then
    raise exception 'NOTHING_TO_UNDO';
  end if;
  if v_tx.created_at < now() - interval '2 minutes' then
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
