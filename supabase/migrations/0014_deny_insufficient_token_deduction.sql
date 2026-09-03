-- ═══════════════════════════════════════════════════════════════════════
-- XMUM Orientation Platform 2026 — Migration 0014
-- Deny Insufficient Token Deductions
--
-- Ensures token balances cannot drop below 0 when GMs or Admins attempt
-- to deduct more tokens than a group currently possesses.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_manual_token_adjust(
  p_group_id         integer,
  p_amount           integer,
  p_transaction_type varchar(50) default 'MANUAL_ADMIN_ADJUST',
  p_notes            text default 'Manual adjustment'
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_current_tokens integer;
  v_new_balance    integer;
begin
  if p_notes is null or trim(p_notes) = '' then
    raise exception 'Notes field is mandatory for manual token adjustments.';
  end if;

  select coalesce(current_tokens, token_balance, 0)
  into v_current_tokens
  from public.groups
  where id = p_group_id or group_id = p_group_id
  for update;

  if v_current_tokens is null then
    raise exception 'Group % not found.', p_group_id;
  end if;

  -- DENY if user/group does not have enough tokens to deduct
  if p_amount < 0 and v_current_tokens < abs(p_amount) then
    return jsonb_build_object(
      'ok', false,
      'error', format('Insufficient tokens: Group %s only has %s tokens, cannot deduct %s tokens. Action denied.', p_group_id, v_current_tokens, abs(p_amount)),
      'current_tokens', v_current_tokens,
      'required_tokens', abs(p_amount)
    );
  end if;

  v_new_balance := v_current_tokens + p_amount;

  update public.groups
  set current_tokens = v_new_balance,
      token_balance  = v_new_balance
  where id = p_group_id or group_id = p_group_id;

  insert into public.token_logs (group_id, amount, transaction_type, notes)
  values (
    p_group_id,
    p_amount,
    p_transaction_type,
    p_notes
  );

  return jsonb_build_object(
    'ok', true,
    'group_id', p_group_id,
    'amount', p_amount,
    'new_tokens', v_new_balance
  );
end;
$$;
