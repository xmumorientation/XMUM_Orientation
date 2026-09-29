-- SECTION 11: Day 2 station entry, payment, and attempt creation.

create table if not exists public.game_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  day smallint not null default 2 check(day=2),
  group_id integer not null references public.groups(id),
  station_id integer not null references public.stations(id),
  gm_user_id uuid not null references public.profiles(id),
  difficulty text not null check(difficulty in ('EASY','MEDIUM','HARD')),
  entry_cost integer not null check(entry_cost>=0),
  exclusion_limit integer not null check(exclusion_limit>=0),
  payment_status text not null default 'PENDING' check(payment_status in ('NOT_INTEGRATED','PENDING','PAID','REFUNDED')),
  result text,
  reward_puzzle_id text,
  status text not null default 'CREATED' check(status in ('CREATED','PAID','RESULT_RECORDED','REWARD_GENERATED','COMPLETED','CANCELLED')),
  token_log_id uuid references public.token_logs(log_id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  request_id text not null unique,
  version bigint not null default 1
);

create index if not exists game_attempt_group_idx on public.game_attempts(group_id,started_at desc);
create index if not exists game_attempt_station_idx on public.game_attempts(station_id,started_at desc);
create index if not exists game_attempt_gm_idx on public.game_attempts(gm_user_id,started_at desc);
create index if not exists game_attempt_status_idx on public.game_attempts(status,started_at desc);
create unique index if not exists game_attempt_one_active_per_group_station
  on public.game_attempts(group_id,station_id)
  where status in ('CREATED','PAID','RESULT_RECORDED','REWARD_GENERATED');

create or replace function public.fn_start_day2_attempt(p_group_id integer,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_station_id integer;
  v_station public.stations%rowtype;
  v_attempt public.game_attempts%rowtype;
  v_allow_replay boolean;
  v_max_attempts integer;
  v_attempt_count integer;
  v_payment jsonb;
  v_token_log_id uuid;
begin
  if auth.uid() is null or not public.has_permission('gameplay.day2') then raise exception 'PERMISSION_DENIED'; end if;
  if p_request_id is null or length(trim(p_request_id))<8 then raise exception 'INVALID_REQUEST_ID'; end if;

  select * into v_attempt from public.game_attempts where request_id=p_request_id;
  if found then
    return jsonb_build_object('ok',true,'duplicate',true,'attempt_id',v_attempt.attempt_id,
      'group_id',v_attempt.group_id,'station_id',v_attempt.station_id,'difficulty',v_attempt.difficulty,
      'entry_cost',v_attempt.entry_cost,'exclusion_limit',v_attempt.exclusion_limit,
      'payment_status',v_attempt.payment_status,'status',v_attempt.status);
  end if;

  if not public.phase_active('day2') then raise exception 'DAY2_SESSION_INACTIVE'; end if;
  if not exists(select 1 from public.groups where id=p_group_id) then raise exception 'GROUP_NOT_FOUND'; end if;
  v_station_id:=public.my_station_id(2);
  if v_station_id is null then raise exception 'DAY2_STATION_NOT_ASSIGNED'; end if;
  select * into v_station from public.stations where id=v_station_id for update;
  if not found or not v_station.is_active or (v_station.day is not null and v_station.day<>2) then
    raise exception 'INVALID_DAY2_STATION';
  end if;
  if upper(coalesce(v_station.difficulty,'')) not in ('EASY','MEDIUM','HARD')
     or v_station.token_cost is null or v_station.token_cost<0
     or v_station.location_exclusion_limit is null or v_station.location_exclusion_limit<0 then
    raise exception 'DAY2_STATION_NOT_CONFIGURED';
  end if;

  v_allow_replay:=public.config_bool('allow_station_replay',false);
  select coalesce((value#>>'{}')::integer,1) into v_max_attempts
  from public.game_config where key='max_station_attempts';
  v_max_attempts:=greatest(coalesce(v_max_attempts,1),1);
  select count(*) into v_attempt_count from public.game_attempts
    where group_id=p_group_id and station_id=v_station_id and status<>'CANCELLED';
  if (not v_allow_replay and v_attempt_count>=1) or (v_allow_replay and v_attempt_count>=v_max_attempts) then
    raise exception 'DAY2_REPLAY_LIMIT_REACHED';
  end if;
  if exists(select 1 from public.game_attempts where group_id=p_group_id and station_id=v_station_id
    and status in ('CREATED','PAID','RESULT_RECORDED','REWARD_GENERATED')) then
    raise exception 'DAY2_ACTIVE_ATTEMPT_EXISTS';
  end if;

  insert into public.game_attempts(
    group_id,station_id,gm_user_id,difficulty,entry_cost,exclusion_limit,payment_status,status,request_id
  ) values(
    p_group_id,v_station_id,auth.uid(),upper(v_station.difficulty),v_station.token_cost,
    v_station.location_exclusion_limit,'PENDING','CREATED',p_request_id
  ) returning * into v_attempt;

  if v_station.token_cost>0 then
    v_payment:=public.fn_token_apply_unchecked(
      p_group_id,-v_station.token_cost,'DAY2_ENTRY','DAY2_ATTEMPT',
      'day2-attempt:'||v_attempt.attempt_id,v_station_id,2,
      'Day 2 entry at Station '||v_station_id,true
    );
    v_token_log_id:=(v_payment->>'log_id')::uuid;
  end if;
  update public.game_attempts set payment_status='PAID',status='PAID',token_log_id=v_token_log_id,version=version+1
    where attempt_id=v_attempt.attempt_id;
  perform public.audit('day2.attempt.start','game_attempt:'||v_attempt.attempt_id,
    jsonb_build_object('group_id',p_group_id,'station_id',v_station_id,'difficulty',upper(v_station.difficulty),
      'entry_cost',v_station.token_cost,'exclusion_limit',v_station.location_exclusion_limit,'request_id',p_request_id));

  return jsonb_build_object('ok',true,'duplicate',false,'attempt_id',v_attempt.attempt_id,
    'group_id',p_group_id,'station_id',v_station_id,'difficulty',upper(v_station.difficulty),
    'entry_cost',v_station.token_cost,'exclusion_limit',v_station.location_exclusion_limit,
    'payment_status','PAID','status','PAID',
    'balance',case when v_payment is null then null else v_payment->'balance' end);
exception when unique_violation then
  select * into v_attempt from public.game_attempts where request_id=p_request_id;
  if found then
    return jsonb_build_object('ok',true,'duplicate',true,'attempt_id',v_attempt.attempt_id,
      'group_id',v_attempt.group_id,'station_id',v_attempt.station_id,'difficulty',v_attempt.difficulty,
      'entry_cost',v_attempt.entry_cost,'exclusion_limit',v_attempt.exclusion_limit,
      'payment_status',v_attempt.payment_status,'status',v_attempt.status);
  end if;
  raise exception 'DAY2_ACTIVE_ATTEMPT_EXISTS';
end $$;

alter table public.game_attempts enable row level security;
drop policy if exists "game attempt readers" on public.game_attempts;
create policy "game attempt readers" on public.game_attempts for select using(
  public.has_permission('logs.game')
  or (public.has_permission('gameplay.day2') and gm_user_id=auth.uid())
);

revoke all on public.game_attempts from anon;
grant select on public.game_attempts to authenticated;
revoke all on function public.fn_start_day2_attempt(integer,text) from public,anon;
grant execute on function public.fn_start_day2_attempt(integer,text) to authenticated;
