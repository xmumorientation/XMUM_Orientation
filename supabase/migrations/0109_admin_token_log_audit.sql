-- Admin → Token: editing or deleting a transaction now writes an audit row.
--
-- The page used to change `token_logs` and `groups` straight from the browser
-- (lib/token-api.ts). Nothing was audited, the result was never checked, and a
-- refused log update still moved the group's balance, so the balance and the
-- ledger could disagree. These two functions do the log row, the balances and
-- the audit row in one transaction, Admin only. They raise instead of
-- partly applying.
--
--   tokens.log_edit    detail: log_id, before / after (group_id, amount, type, notes), balance_after
--   tokens.log_delete  detail: log_id, group_id, amount, type, notes, balance_after

create or replace function public.fn_admin_update_token_log(
  p_log_id uuid,
  p_group_id integer,
  p_amount integer,
  p_notes text,
  p_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.token_logs%rowtype;
  v_type text;
  v_notes text := coalesce(btrim(p_notes), '');
  v_balance integer;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select * into v_old from public.token_logs where log_id = p_log_id for update;
  if not found then
    raise exception 'LOG_NOT_FOUND';
  end if;
  if not exists (select 1 from public.groups where id = p_group_id) then
    raise exception 'GROUP_NOT_FOUND';
  end if;

  -- Keep the log's own type unless a new one is given (a reversal row has a type the page's list lacks).
  v_type := coalesce(nullif(btrim(p_type), ''), v_old.transaction_type);

  -- Lock both balances in id order so two edits cannot deadlock.
  perform 1 from public.groups where id in (v_old.group_id, p_group_id) order by id for update;

  begin
    if v_old.group_id = p_group_id then
      update public.groups set token_balance = token_balance - v_old.amount + p_amount where id = p_group_id;
    else
      update public.groups set token_balance = token_balance - v_old.amount where id = v_old.group_id;
      update public.groups set token_balance = token_balance + p_amount where id = p_group_id;
    end if;

    update public.token_logs
       set group_id = p_group_id, amount = p_amount, notes = v_notes, transaction_type = v_type
     where log_id = p_log_id;
  exception
    when check_violation then
      raise exception 'NEGATIVE_BALANCE_OR_BAD_TYPE';
  end;

  select token_balance into v_balance from public.groups where id = p_group_id;

  perform public.audit(
    'tokens.log_edit',
    'group:' || p_group_id,
    jsonb_build_object(
      'log_id', p_log_id,
      'before', jsonb_build_object('group_id', v_old.group_id, 'amount', v_old.amount, 'type', v_old.transaction_type, 'notes', v_old.notes),
      'after', jsonb_build_object('group_id', p_group_id, 'amount', p_amount, 'type', v_type, 'notes', v_notes),
      'balance_after', v_balance
    )
  );

  return jsonb_build_object('ok', true, 'balance_after', v_balance);
end;
$$;

create or replace function public.fn_admin_delete_token_log(p_log_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.token_logs%rowtype;
  v_balance integer;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select * into v_old from public.token_logs where log_id = p_log_id for update;
  if not found then
    raise exception 'LOG_NOT_FOUND';
  end if;

  perform 1 from public.groups where id = v_old.group_id for update;

  begin
    update public.groups set token_balance = token_balance - v_old.amount where id = v_old.group_id;
  exception
    when check_violation then
      raise exception 'NEGATIVE_BALANCE_OR_BAD_TYPE';
  end;

  delete from public.token_logs where log_id = p_log_id;

  select token_balance into v_balance from public.groups where id = v_old.group_id;

  perform public.audit(
    'tokens.log_delete',
    'group:' || v_old.group_id,
    jsonb_build_object(
      'log_id', p_log_id,
      'group_id', v_old.group_id,
      'amount', v_old.amount,
      'type', v_old.transaction_type,
      'notes', v_old.notes,
      'balance_after', v_balance
    )
  );

  return jsonb_build_object('ok', true, 'balance_after', v_balance);
end;
$$;

revoke execute on function public.fn_admin_update_token_log(uuid, integer, integer, text, text) from public, anon;
revoke execute on function public.fn_admin_delete_token_log(uuid) from public, anon;
grant execute on function public.fn_admin_update_token_log(uuid, integer, integer, text, text) to authenticated;
grant execute on function public.fn_admin_delete_token_log(uuid) to authenticated;
