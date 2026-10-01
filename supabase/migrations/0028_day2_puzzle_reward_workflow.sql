-- SECTION 13: GM Day 2 result selection, Puzzle reservation, and one-time grant.

alter table public.game_attempts
  add column if not exists excluded_locations public.projector_location[] not null default '{}',
  add column if not exists result_submitted_at timestamptz,
  add column if not exists result_request_id text unique,
  add column if not exists reward_commit_request_id text unique,
  add column if not exists exhaustion_policy_used text;

create or replace function public.fn_submit_day2_result(
  p_attempt_id uuid,
  p_result text,
  p_excluded_locations public.projector_location[],
  p_request_id text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_attempt public.game_attempts%rowtype;
  v_item public.items%rowtype;
  v_result text:=upper(trim(coalesce(p_result,'')));
  v_excluded public.projector_location[]:=coalesce(p_excluded_locations,'{}');
  v_policy text;
  v_count integer;
begin
  if auth.uid() is null or not public.has_permission('gameplay.day2') then raise exception 'PERMISSION_DENIED'; end if;
  if p_request_id is null or length(trim(p_request_id))<8 then raise exception 'INVALID_REQUEST_ID'; end if;
  if v_result not in ('WIN','LOSE') then raise exception 'DAY2_RESULT_REQUIRED'; end if;

  select * into v_attempt from public.game_attempts where result_request_id=p_request_id;
  if found then
    if v_attempt.gm_user_id<>auth.uid() then raise exception 'PERMISSION_DENIED'; end if;
    return jsonb_build_object('ok',true,'duplicate',true,'attempt_id',v_attempt.attempt_id,
      'result',v_attempt.result,'status',v_attempt.status,'reward_puzzle_id',v_attempt.reward_puzzle_id);
  end if;

  select * into v_attempt from public.game_attempts where attempt_id=p_attempt_id for update;
  if not found then raise exception 'DAY2_ATTEMPT_NOT_FOUND'; end if;
  if v_attempt.gm_user_id<>auth.uid() or v_attempt.station_id<>public.my_station_id(2) then raise exception 'NOT_YOUR_STATION'; end if;
  if not public.phase_active('day2') then raise exception 'DAY2_SESSION_INACTIVE'; end if;
  if v_attempt.status<>'PAID' then
    if v_attempt.status in ('RESULT_RECORDED','REWARD_GENERATED','COMPLETED') then
      return jsonb_build_object('ok',true,'duplicate',true,'attempt_id',v_attempt.attempt_id,
        'result',v_attempt.result,'status',v_attempt.status,'reward_puzzle_id',v_attempt.reward_puzzle_id);
    end if;
    raise exception 'DAY2_ATTEMPT_NOT_ACTIVE';
  end if;

  select count(distinct x) into v_count from unnest(v_excluded) x;
  if v_count<>cardinality(v_excluded) then raise exception 'DAY2_DUPLICATE_EXCLUSION'; end if;
  if cardinality(v_excluded)>v_attempt.exclusion_limit then raise exception 'DAY2_EXCLUSION_LIMIT'; end if;

  if v_result='LOSE' then
    update public.game_attempts set result='LOSE',excluded_locations=v_excluded,status='COMPLETED',
      result_submitted_at=now(),completed_at=now(),result_request_id=p_request_id,version=version+1
    where attempt_id=v_attempt.attempt_id;
    insert into public.group_notifications(group_id,notification_type,message,reference_id)
      values(v_attempt.group_id,'DAY2_RESULT','Group '||v_attempt.group_id||' completed Station '||v_attempt.station_id||' without a Puzzle reward.',v_attempt.attempt_id::text);
    perform public.audit('day2.result.lose','game_attempt:'||v_attempt.attempt_id,
      jsonb_build_object('group_id',v_attempt.group_id,'station_id',v_attempt.station_id,'excluded_locations',v_excluded));
    return jsonb_build_object('ok',true,'duplicate',false,'attempt_id',v_attempt.attempt_id,'result','LOSE','status','COMPLETED');
  end if;

  -- Serialize reward reservations for this group across different stations.
  perform pg_advisory_xact_lock(1300,v_attempt.group_id);
  select upper(coalesce(value#>>'{}','STOP')) into v_policy from public.game_config where key='puzzle_pool_exhaustion_policy';
  v_policy:=coalesce(v_policy,'STOP');

  select * into v_item from public.items i
  where i.type='puzzle' and i.is_active and not (i.puzzle_location=any(v_excluded))
    and not exists(select 1 from public.inventory inv where inv.group_id=v_attempt.group_id and inv.item_id=i.id)
    and not exists(select 1 from public.game_attempts ga where ga.group_id=v_attempt.group_id
      and ga.attempt_id<>v_attempt.attempt_id and ga.reward_puzzle_id=i.puzzle_code
      and ga.status in ('RESULT_RECORDED','REWARD_GENERATED','COMPLETED'))
  order by random() limit 1;

  -- REUSE currently means expand past the excluded locations, never duplicate history.
  if not found and v_policy in ('REUSE','EXPAND_POOL') then
    select * into v_item from public.items i
    where i.type='puzzle' and i.is_active
      and not exists(select 1 from public.inventory inv where inv.group_id=v_attempt.group_id and inv.item_id=i.id)
      and not exists(select 1 from public.game_attempts ga where ga.group_id=v_attempt.group_id
        and ga.attempt_id<>v_attempt.attempt_id and ga.reward_puzzle_id=i.puzzle_code
        and ga.status in ('RESULT_RECORDED','REWARD_GENERATED','COMPLETED'))
    order by random() limit 1;
  end if;
  if not found and v_policy='NO_REWARD' then
    update public.game_attempts set result='WIN',excluded_locations=v_excluded,status='COMPLETED',
      result_submitted_at=now(),completed_at=now(),result_request_id=p_request_id,
      exhaustion_policy_used=v_policy,version=version+1 where attempt_id=v_attempt.attempt_id;
    return jsonb_build_object('ok',true,'duplicate',false,'attempt_id',v_attempt.attempt_id,'result','WIN','status','COMPLETED','no_reward',true);
  elsif not found then
    raise exception 'NO_ELIGIBLE_PUZZLE';
  end if;

  update public.game_attempts set result='WIN',excluded_locations=v_excluded,reward_puzzle_id=v_item.puzzle_code,
    status='REWARD_GENERATED',result_submitted_at=now(),result_request_id=p_request_id,
    exhaustion_policy_used=v_policy,version=version+1 where attempt_id=v_attempt.attempt_id;
  perform public.audit('day2.result.reserve','game_attempt:'||v_attempt.attempt_id,
    jsonb_build_object('group_id',v_attempt.group_id,'station_id',v_attempt.station_id,'difficulty',v_attempt.difficulty,
      'excluded_locations',v_excluded,'result','WIN','reward_puzzle_id',v_item.puzzle_code,'policy',v_policy));
  return jsonb_build_object('ok',true,'duplicate',false,'attempt_id',v_attempt.attempt_id,
    'result','WIN','status','REWARD_GENERATED','reward_puzzle_id',v_item.puzzle_code);
end $$;

create or replace function public.fn_commit_day2_puzzle_reward(p_attempt_id uuid,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_attempt public.game_attempts%rowtype; v_item_id integer; v_inventory_id bigint;
begin
  if auth.uid() is null or not public.has_permission('gameplay.day2') then raise exception 'PERMISSION_DENIED'; end if;
  if p_request_id is null or length(trim(p_request_id))<8 then raise exception 'INVALID_REQUEST_ID'; end if;
  select * into v_attempt from public.game_attempts where attempt_id=p_attempt_id for update;
  if not found then raise exception 'DAY2_ATTEMPT_NOT_FOUND'; end if;
  if v_attempt.gm_user_id<>auth.uid() or v_attempt.station_id<>public.my_station_id(2) then raise exception 'NOT_YOUR_STATION'; end if;
  if v_attempt.status='COMPLETED' and v_attempt.result='WIN' then
    select id into v_inventory_id from public.inventory where obtained_attempt_id=v_attempt.attempt_id;
    return jsonb_build_object('ok',true,'duplicate',true,'attempt_id',v_attempt.attempt_id,
      'status','COMPLETED','reward_puzzle_id',v_attempt.reward_puzzle_id,'inventory_id',v_inventory_id);
  end if;
  if v_attempt.status<>'REWARD_GENERATED' or v_attempt.result<>'WIN' or v_attempt.reward_puzzle_id is null then
    raise exception 'DAY2_REWARD_NOT_READY';
  end if;
  select id into v_item_id from public.items where type='puzzle' and puzzle_code=v_attempt.reward_puzzle_id;
  if v_item_id is null then raise exception 'PUZZLE_NOT_AVAILABLE'; end if;
  insert into public.inventory(group_id,item_id,item_type,source,granted_by,idempotency_key,obtained_station_id,obtained_attempt_id)
    values(v_attempt.group_id,v_item_id,'puzzle','day2_attempt',auth.uid(),'day2-reward:'||v_attempt.attempt_id,
      v_attempt.station_id,v_attempt.attempt_id) returning id into v_inventory_id;
  update public.game_attempts set status='COMPLETED',completed_at=now(),reward_commit_request_id=p_request_id,version=version+1
    where attempt_id=v_attempt.attempt_id;
  insert into public.group_notifications(group_id,notification_type,message,reference_id)
    values(v_attempt.group_id,'PUZZLE_RECEIVED','Your group received Puzzle '||v_attempt.reward_puzzle_id||'.',v_inventory_id::text);
  perform public.audit('day2.result.commit','game_attempt:'||v_attempt.attempt_id,
    jsonb_build_object('group_id',v_attempt.group_id,'station_id',v_attempt.station_id,
      'result','WIN','reward_puzzle_id',v_attempt.reward_puzzle_id,'inventory_id',v_inventory_id));
  return jsonb_build_object('ok',true,'duplicate',false,'attempt_id',v_attempt.attempt_id,
    'status','COMPLETED','reward_puzzle_id',v_attempt.reward_puzzle_id,'inventory_id',v_inventory_id);
end $$;

revoke all on function public.fn_submit_day2_result(uuid,text,public.projector_location[],text),
  public.fn_commit_day2_puzzle_reward(uuid,text) from public,anon;
grant execute on function public.fn_submit_day2_result(uuid,text,public.projector_location[],text),
  public.fn_commit_day2_puzzle_reward(uuid,text) to authenticated;
