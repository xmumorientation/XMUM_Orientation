-- SECTION 10: GM Day 1 single-group and PK result submission.

create table if not exists public.day1_game_results (
  result_id uuid primary key default gen_random_uuid(),
  station_id integer not null references public.stations(id),
  gm_user_id uuid not null references public.profiles(id),
  winner_group_id integer references public.groups(id),
  loser_group_id integer references public.groups(id),
  winner_reward integer not null check (winner_reward>=0),
  loser_reward integer not null check (loser_reward>=0),
  winner_token_log_id uuid references public.token_logs(log_id),
  loser_token_log_id uuid references public.token_logs(log_id),
  request_id text not null unique,
  submitted_at timestamptz not null default now(),
  check (winner_group_id is not null or loser_group_id is not null),
  check (winner_group_id is null or loser_group_id is null or winner_group_id<>loser_group_id)
);

create index if not exists day1_results_station_idx on public.day1_game_results(station_id,submitted_at desc);
create index if not exists day1_results_gm_idx on public.day1_game_results(gm_user_id,submitted_at desc);
create index if not exists day1_results_winner_idx on public.day1_game_results(winner_group_id,submitted_at desc);
create index if not exists day1_results_loser_idx on public.day1_game_results(loser_group_id,submitted_at desc);

create or replace function public.fn_submit_day1_result(
  p_winner_group_id integer,
  p_loser_group_id integer,
  p_request_id text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_station integer;
  v_result public.day1_game_results%rowtype;
  v_win_reward integer;
  v_lose_reward integer;
  v_win_tx jsonb;
  v_lose_tx jsonb;
  v_win_log uuid;
  v_lose_log uuid;
begin
  if auth.uid() is null or not public.has_permission('gameplay.day1') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_request_id is null or length(trim(p_request_id))<8 then
    raise exception 'INVALID_REQUEST_ID';
  end if;

  select * into v_result from public.day1_game_results where request_id=p_request_id;
  if found then
    return jsonb_build_object(
      'ok',true,'duplicate',true,'result_id',v_result.result_id,
      'station_id',v_result.station_id,'winner_group_id',v_result.winner_group_id,
      'loser_group_id',v_result.loser_group_id,'winner_reward',v_result.winner_reward,
      'loser_reward',v_result.loser_reward
    );
  end if;

  if p_winner_group_id is null and p_loser_group_id is null then
    raise exception 'DAY1_RESULT_EMPTY';
  end if;
  if p_winner_group_id is not null and p_winner_group_id=p_loser_group_id then
    raise exception 'DAY1_SAME_GROUP';
  end if;
  if p_winner_group_id is not null and not exists(select 1 from public.groups where id=p_winner_group_id) then
    raise exception 'GROUP_NOT_FOUND';
  end if;
  if p_loser_group_id is not null and not exists(select 1 from public.groups where id=p_loser_group_id) then
    raise exception 'GROUP_NOT_FOUND';
  end if;
  if not public.phase_active('day1') then raise exception 'DAY1_SESSION_INACTIVE'; end if;

  v_station:=public.my_station_id(1);
  if v_station is null then raise exception 'DAY1_STATION_NOT_ASSIGNED'; end if;
  if not exists(
    select 1 from public.stations where id=v_station and is_active and (day is null or day=1)
  ) then raise exception 'INVALID_DAY1_STATION'; end if;

  select coalesce(
    (select (value#>>'{}')::integer from public.game_config where key='day1_win_reward'),
    (select rule_value from public.game_config_rules where rule_key='DAY1_WIN_TOKENS')
  ) into v_win_reward;
  select coalesce(
    (select (value#>>'{}')::integer from public.game_config where key='day1_lose_reward'),
    (select rule_value from public.game_config_rules where rule_key='DAY1_LOSE_TOKENS')
  ) into v_lose_reward;
  if v_win_reward is null or v_lose_reward is null or v_win_reward<0 or v_lose_reward<0 then
    raise exception 'DAY1_REWARD_NOT_CONFIGURED';
  end if;

  -- Claim the request before applying rewards. All following work is in this
  -- same transaction, so a failure rolls the result and every credit back.
  insert into public.day1_game_results(
    station_id,gm_user_id,winner_group_id,loser_group_id,winner_reward,loser_reward,request_id
  ) values(v_station,auth.uid(),p_winner_group_id,p_loser_group_id,v_win_reward,v_lose_reward,p_request_id)
  returning * into v_result;

  if p_winner_group_id is not null and v_win_reward>0 then
    v_win_tx:=public.fn_token_apply_unchecked(
      p_winner_group_id,v_win_reward,'DAY1_GAME','DAY1_RESULT',
      'day1-result:'||v_result.result_id||':winner',v_station,1,
      'Day 1 win at Station '||v_station,true
    );
    v_win_log:=(v_win_tx->>'log_id')::uuid;
  end if;
  if p_loser_group_id is not null and v_lose_reward>0 then
    v_lose_tx:=public.fn_token_apply_unchecked(
      p_loser_group_id,v_lose_reward,'DAY1_GAME','DAY1_RESULT',
      'day1-result:'||v_result.result_id||':loser',v_station,1,
      'Day 1 participation at Station '||v_station,true
    );
    v_lose_log:=(v_lose_tx->>'log_id')::uuid;
  end if;

  update public.day1_game_results
  set winner_token_log_id=v_win_log,loser_token_log_id=v_lose_log
  where result_id=v_result.result_id;
  perform public.audit('day1.result.submit','day1_result:'||v_result.result_id,
    jsonb_build_object('station_id',v_station,'winner_group_id',p_winner_group_id,
      'loser_group_id',p_loser_group_id,'winner_reward',v_win_reward,
      'loser_reward',v_lose_reward,'request_id',p_request_id));

  return jsonb_build_object(
    'ok',true,'duplicate',false,'result_id',v_result.result_id,'station_id',v_station,
    'winner_group_id',p_winner_group_id,'loser_group_id',p_loser_group_id,
    'winner_reward',v_win_reward,'loser_reward',v_lose_reward,
    'winner_token_log_id',v_win_log,'loser_token_log_id',v_lose_log
  );
exception when unique_violation then
  select * into v_result from public.day1_game_results where request_id=p_request_id;
  if found then
    return jsonb_build_object('ok',true,'duplicate',true,'result_id',v_result.result_id,
      'station_id',v_result.station_id,'winner_group_id',v_result.winner_group_id,
      'loser_group_id',v_result.loser_group_id,'winner_reward',v_result.winner_reward,
      'loser_reward',v_result.loser_reward);
  end if;
  raise;
end $$;

alter table public.day1_game_results enable row level security;
drop policy if exists "day1 result readers" on public.day1_game_results;
create policy "day1 result readers" on public.day1_game_results for select using(
  public.has_permission('logs.game')
  or (public.has_permission('gameplay.day1') and gm_user_id=auth.uid())
);

revoke all on public.day1_game_results from anon;
grant select on public.day1_game_results to authenticated;
revoke all on function public.fn_submit_day1_result(integer,integer,text) from public,anon;
grant execute on function public.fn_submit_day1_result(integer,integer,text) to authenticated;
