-- SECTION 09: atomic group Token ledger while preserving the teammate-facing
-- token_logs API and the legacy token_transactions history view.

alter table public.token_logs
  add column if not exists balance_before integer,
  add column if not exists balance_after integer,
  add column if not exists bonding_day smallint check (bonding_day in (1,2)),
  add column if not exists actor_user_id uuid references public.profiles(id),
  add column if not exists reference_type text,
  add column if not exists reversed_by uuid references public.token_logs(log_id),
  add column if not exists correction_reason text;

alter table public.token_logs drop constraint if exists token_logs_transaction_type_check;
alter table public.token_logs add constraint token_logs_transaction_type_check check (
  transaction_type in (
    'DAY1_GAME','DAY2_ENTRY','MANUAL_GM_ADJUST','MANUAL_ADMIN_ADJUST',
    'SYSTEM_RESET','BLIND_BOX_CLAIM','BLIND_BOX_REWARD',
    'TOKEN_CORRECTION','TOKEN_REVERSAL'
  )
);

create index if not exists token_logs_station_idx on public.token_logs(station_id,created_at desc);
create index if not exists token_logs_day_idx on public.token_logs(bonding_day,created_at desc);
create index if not exists token_logs_actor_idx on public.token_logs(actor_user_id,created_at desc);

create table if not exists public.token_log_corrections (
  correction_id bigserial primary key,
  original_log_id uuid not null references public.token_logs(log_id),
  replacement_log_id uuid references public.token_logs(log_id),
  reversal_log_id uuid not null references public.token_logs(log_id),
  old_group_id integer not null references public.groups(id),
  new_group_id integer not null references public.groups(id),
  old_amount integer not null,
  new_amount integer not null,
  old_transaction_type varchar(50) not null,
  new_transaction_type varchar(50) not null,
  old_notes text,
  new_notes text,
  reason text not null,
  edited_by uuid not null references public.profiles(id),
  edited_at timestamptz not null default now()
);

create table if not exists public.token_notifications (
  id bigserial primary key,
  group_id integer references public.groups(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  station_id integer references public.stations(id) on delete set null,
  bonding_day smallint check (bonding_day in (1,2)),
  message text not null,
  reference_id text,
  created_at timestamptz not null default now(),
  check (group_id is not null or user_id is not null)
);
create index if not exists token_notifications_group_idx on public.token_notifications(group_id,created_at desc);
create index if not exists token_notifications_user_idx on public.token_notifications(user_id,created_at desc);

-- The only balance mutation primitive. It locks the group, validates the
-- resulting balance, writes both compatibility ledgers, then emits targeted
-- group/assigned-GM notifications in the same transaction.
create or replace function public.fn_token_apply_unchecked(
  p_group_id integer,
  p_amount integer,
  p_transaction_type varchar,
  p_reference_type text default null,
  p_reference_id text default null,
  p_station_id integer default null,
  p_bonding_day smallint default null,
  p_notes text default '',
  p_notify boolean default true
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_before integer;
  v_after integer;
  v_log_id uuid;
  v_existing public.token_logs%rowtype;
  v_message text;
begin
  if p_amount=0 or abs(p_amount)>100000 then raise exception 'INVALID_TOKEN_AMOUNT'; end if;
  if p_bonding_day is not null and p_bonding_day not in (1,2) then raise exception 'INVALID_BONDING_DAY'; end if;
  if p_reference_id is not null then
    select * into v_existing from public.token_logs where reference_id=p_reference_id;
    if found then
      return jsonb_build_object('ok',true,'duplicate',true,'log_id',v_existing.log_id,'balance',v_existing.balance_after);
    end if;
  end if;

  select coalesce(current_tokens,token_balance,0) into v_before
  from public.groups where id=p_group_id for update;
  if not found then raise exception 'GROUP_NOT_FOUND'; end if;
  v_after:=v_before+p_amount;
  if v_after<0 then raise exception 'INSUFFICIENT_BALANCE'; end if;

  update public.groups set current_tokens=v_after,token_balance=v_after where id=p_group_id;
  insert into public.token_logs(
    group_id,amount,transaction_type,station_id,notes,balance_before,balance_after,
    bonding_day,actor_user_id,reference_type,reference_id
  ) values (
    p_group_id,p_amount,p_transaction_type,p_station_id,coalesce(p_notes,''),v_before,v_after,
    p_bonding_day,auth.uid(),p_reference_type,p_reference_id
  ) returning log_id into v_log_id;

  insert into public.token_transactions(group_id,delta,reason,actor,station_id,idempotency_key)
  values(p_group_id,p_amount,coalesce(p_notes,''),auth.uid(),p_station_id,p_reference_id)
  on conflict(idempotency_key) do nothing;

  if p_notify then
    v_message:=case when p_amount>0 then 'Your group received '||p_amount||' tokens.'
                    else 'Your group spent '||abs(p_amount)||' tokens.' end;
    insert into public.token_notifications(group_id,station_id,bonding_day,message,reference_id)
      values(p_group_id,p_station_id,p_bonding_day,v_message,p_reference_id);
    if p_station_id is not null and p_bonding_day is not null then
      insert into public.token_notifications(user_id,station_id,bonding_day,message,reference_id)
      select user_id,p_station_id,p_bonding_day,
        'Station '||p_station_id||case when p_amount<0 then ' deducted ' else ' awarded ' end||abs(p_amount)||' tokens for Group '||p_group_id||'.',
        p_reference_id
      from public.gm_station_assignments
      where station_id=p_station_id and day=p_bonding_day;
    end if;
  end if;

  return jsonb_build_object('ok',true,'duplicate',false,'log_id',v_log_id,
    'balance_before',v_before,'balance',v_after);
exception when unique_violation then
  if p_reference_id is not null then
    select * into v_existing from public.token_logs where reference_id=p_reference_id;
    return jsonb_build_object('ok',true,'duplicate',true,'log_id',v_existing.log_id,'balance',v_existing.balance_after);
  end if;
  raise;
end $$;

revoke all on function public.fn_token_apply_unchecked(integer,integer,varchar,text,text,integer,smallint,text,boolean)
  from public,anon,authenticated;

-- Preserve the existing Admin RPC name used by the teammate UI.
create or replace function public.fn_manual_token_adjust(
  p_group_id integer,p_amount integer,
  p_transaction_type varchar default 'MANUAL_ADMIN_ADJUST',
  p_notes text default 'Manual adjustment'
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.has_permission('token.manage') then raise exception 'PERMISSION_DENIED'; end if;
  if nullif(trim(p_notes),'') is null then raise exception 'CORRECTION_REASON_REQUIRED'; end if;
  return public.fn_token_apply_unchecked(p_group_id,p_amount,p_transaction_type,
    'ADMIN_ADJUSTMENT','admin-adjust:'||gen_random_uuid(),null,null,p_notes,true);
end $$;

-- Keep the existing gameplay wrapper chain from migration 0018, but make the
-- unchecked implementations use the same atomic ledger primitive.
create or replace function public.fn_day1_record_result_unchecked(
  p_win_group_id integer default null,p_lose_group_id integer default null,
  p_station_id integer default null,p_notes text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_win integer; v_lose integer; v_win_result jsonb; v_lose_result jsonb;
begin
  select coalesce(
    (select (value#>>'{}')::integer from public.game_config where key='day1_win_reward'),
    (select rule_value from public.game_config_rules where rule_key='DAY1_WIN_TOKENS'),0
  ) into v_win;
  select coalesce(
    (select (value#>>'{}')::integer from public.game_config where key='day1_lose_reward'),
    (select rule_value from public.game_config_rules where rule_key='DAY1_LOSE_TOKENS'),0
  ) into v_lose;
  if p_win_group_id is not null and v_win>0 then
    v_win_result:=public.fn_token_apply_unchecked(p_win_group_id,v_win,'DAY1_GAME','DAY1_RESULT',null,
      p_station_id,1,coalesce(p_notes,'Day 1 Station Victory'),true);
  end if;
  if p_lose_group_id is not null and v_lose>0 then
    v_lose_result:=public.fn_token_apply_unchecked(p_lose_group_id,v_lose,'DAY1_GAME','DAY1_RESULT',null,
      p_station_id,1,coalesce(p_notes,'Day 1 Station Participation'),true);
  end if;
  return jsonb_build_object('ok',true,'win_group_id',p_win_group_id,'win_tokens',v_win,
    'lose_group_id',p_lose_group_id,'lose_tokens',v_lose);
end $$;

create or replace function public.fn_day2_deduct_entry_unchecked(
  p_group_id integer,p_token_cost integer,p_station_id integer default null,p_notes text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_cost integer; v_result jsonb;
begin
  select coalesce(token_cost,entry_cost,p_token_cost,0) into v_cost from public.stations where id=p_station_id;
  if not found then raise exception 'STATION_NOT_FOUND'; end if;
  if v_cost<0 then raise exception 'INVALID_TOKEN_AMOUNT'; end if;
  if v_cost=0 then return jsonb_build_object('ok',true,'group_id',p_group_id,'deducted',0); end if;
  v_result:=public.fn_token_apply_unchecked(p_group_id,-v_cost,'DAY2_ENTRY','DAY2_STATION_ENTRY',null,
    p_station_id,2,coalesce(p_notes,'Day 2 Station Entry Fee'),true);
  return jsonb_build_object('ok',true,'group_id',p_group_id,'deducted',v_cost,'remaining_tokens',v_result->'balance');
end $$;

create or replace function public.fn_reset_token_state(p_reason text default 'Admin system reset')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_group record; v_count integer:=0;
begin
  if not public.has_permission('token.manage') then raise exception 'PERMISSION_DENIED'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'CORRECTION_REASON_REQUIRED'; end if;
  for v_group in select id,coalesce(current_tokens,token_balance,0) as balance from public.groups order by id for update loop
    if v_group.balance<>0 then
      perform public.fn_token_apply_unchecked(v_group.id,-v_group.balance,'SYSTEM_RESET','SYSTEM_RESET',
        'system-reset:'||gen_random_uuid(),null,null,p_reason,false);
      v_count:=v_count+1;
    end if;
  end loop;
  delete from public.puzzle_inventory;
  perform public.audit('tokens.reset','all_groups',jsonb_build_object('reason',p_reason,'groups_reset',v_count));
  return jsonb_build_object('ok',true,'groups_reset',v_count);
end $$;

-- Corrections never delete history. They append a reversal and replacement,
-- link the original row, and store an immutable before/after record.
create or replace function public.fn_correct_token_log(
  p_log_id uuid,p_new_group_id integer,p_new_amount integer,
  p_new_transaction_type varchar,p_new_notes text,p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_old public.token_logs%rowtype;
  v_reverse jsonb;
  v_replace jsonb;
  v_reverse_id uuid;
  v_replace_id uuid;
begin
  if not public.has_permission('token.manage') then raise exception 'PERMISSION_DENIED'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'CORRECTION_REASON_REQUIRED'; end if;
  select * into v_old from public.token_logs where log_id=p_log_id for update;
  if not found then raise exception 'TOKEN_LOG_NOT_FOUND'; end if;
  if v_old.reversed_by is not null then raise exception 'TOKEN_LOG_ALREADY_REVERSED'; end if;
  if p_new_amount=0 then raise exception 'INVALID_TOKEN_AMOUNT'; end if;

  -- Consistent locking order protects cross-group corrections from deadlocks.
  perform 1 from public.groups where id in (v_old.group_id,p_new_group_id) order by id for update;
  v_reverse:=public.fn_token_apply_unchecked(v_old.group_id,-v_old.amount,'TOKEN_REVERSAL',
    'TOKEN_CORRECTION','correction-reverse:'||p_log_id,null,v_old.bonding_day,
    'Reversal for corrected transaction '||p_log_id,false);
  v_reverse_id:=(v_reverse->>'log_id')::uuid;
  v_replace:=public.fn_token_apply_unchecked(p_new_group_id,p_new_amount,p_new_transaction_type,
    'TOKEN_CORRECTION','correction-replacement:'||p_log_id,v_old.station_id,v_old.bonding_day,
    p_new_notes,true);
  v_replace_id:=(v_replace->>'log_id')::uuid;
  update public.token_logs set reversed_by=v_reverse_id,correction_reason=p_reason where log_id=p_log_id;
  insert into public.token_log_corrections(
    original_log_id,replacement_log_id,reversal_log_id,old_group_id,new_group_id,
    old_amount,new_amount,old_transaction_type,new_transaction_type,old_notes,new_notes,reason,edited_by
  ) values(p_log_id,v_replace_id,v_reverse_id,v_old.group_id,p_new_group_id,v_old.amount,p_new_amount,
    v_old.transaction_type,p_new_transaction_type,v_old.notes,p_new_notes,p_reason,auth.uid());
  perform public.audit('tokens.correct','token_log:'||p_log_id,
    jsonb_build_object('old_group',v_old.group_id,'new_group',p_new_group_id,'old_amount',v_old.amount,'new_amount',p_new_amount,'reason',p_reason));
  return jsonb_build_object('ok',true,'reversal_log_id',v_reverse_id,'replacement_log_id',v_replace_id,
    'new_balance',v_replace->'balance');
end $$;

create or replace function public.fn_reverse_token_log(p_log_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_old public.token_logs%rowtype; v_result jsonb; v_reverse_id uuid;
begin
  if not public.has_permission('token.manage') then raise exception 'PERMISSION_DENIED'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'CORRECTION_REASON_REQUIRED'; end if;
  select * into v_old from public.token_logs where log_id=p_log_id for update;
  if not found then raise exception 'TOKEN_LOG_NOT_FOUND'; end if;
  if v_old.reversed_by is not null then raise exception 'TOKEN_LOG_ALREADY_REVERSED'; end if;
  v_result:=public.fn_token_apply_unchecked(v_old.group_id,-v_old.amount,'TOKEN_REVERSAL',
    'TOKEN_REVERSAL','reversal:'||p_log_id,v_old.station_id,v_old.bonding_day,p_reason,true);
  v_reverse_id:=(v_result->>'log_id')::uuid;
  update public.token_logs set reversed_by=v_reverse_id,correction_reason=p_reason where log_id=p_log_id;
  perform public.audit('tokens.reverse','token_log:'||p_log_id,jsonb_build_object('reason',p_reason,'reversal_log_id',v_reverse_id));
  return jsonb_build_object('ok',true,'reversal_log_id',v_reverse_id,'new_balance',v_result->'balance');
end $$;

-- Least-privilege ledger visibility.
drop policy if exists "permitted users read token logs" on public.token_logs;
drop policy if exists "admin corrects token logs" on public.token_logs;
create policy "own group or assigned station reads token logs" on public.token_logs for select using(
  public.has_permission('token.manage')
  or group_id=public.current_gameplay_group_id()
  or (public.has_permission('token.play') and station_id in (
    select station_id from public.gm_station_assignments where user_id=auth.uid()
  ))
);

alter table public.token_log_corrections enable row level security;
alter table public.token_notifications enable row level security;
create policy "admin reads token corrections" on public.token_log_corrections for select using(public.has_permission('token.manage'));
create policy "target reads token notifications" on public.token_notifications for select using(
  public.has_permission('token.manage') or user_id=auth.uid() or group_id=public.current_gameplay_group_id()
);

revoke insert,update,delete on public.token_logs from authenticated;
revoke all on public.token_log_corrections,public.token_notifications from anon;
grant select on public.token_logs,public.token_log_corrections,public.token_notifications to authenticated;
revoke all on function public.fn_correct_token_log(uuid,integer,integer,varchar,text,text),public.fn_reverse_token_log(uuid,text) from public,anon;
revoke all on function public.fn_reset_token_state(text) from public,anon;
grant execute on function public.fn_manual_token_adjust(integer,integer,varchar,text),public.fn_correct_token_log(uuid,integer,integer,varchar,text,text),public.fn_reverse_token_log(uuid,text),public.fn_reset_token_state(text) to authenticated;

do $$ begin alter publication supabase_realtime add table public.token_notifications; exception when duplicate_object then null; end $$;
