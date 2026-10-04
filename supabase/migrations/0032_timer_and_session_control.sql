-- Section 17: authoritative bonding-session timer and Admin controls.
-- The existing phases table remains the single source of truth so every
-- gameplay RPC that already calls phase_active() is locked by this timer.

alter table public.phases add column if not exists paused_at timestamptz;
alter table public.phases add column if not exists updated_by uuid references public.profiles(id);
alter table public.phases add column if not exists updated_at timestamptz not null default now();
alter table public.phases add column if not exists version bigint not null default 1;

create table if not exists public.session_control_log (
  log_id bigserial primary key,
  phase_id integer not null references public.phases(id),
  phase_key text not null,
  action text not null check (action in (
    'TIMER_STARTED','TIMER_PAUSED','TIMER_RESUMED','TIMER_EXTENDED',
    'TIMER_RESET','SESSION_ENDED'
  )),
  previous_state public.phase_state not null,
  new_state public.phase_state not null,
  seconds_changed integer not null default 0,
  actor_user_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists session_control_log_phase_time_idx
  on public.session_control_log(phase_key, created_at desc);

alter table public.session_control_log enable row level security;
drop policy if exists "admin reads session control log" on public.session_control_log;
create policy "admin reads session control log" on public.session_control_log
  for select using (public.is_admin());

-- Preserve an Admin-customised duration. Only replace the old project default.
update public.game_config
set value = '150'::jsonb, updated_at = now()
where key = 'bonding_session_duration' and (value #>> '{}')::integer = 120;

update public.phases
set duration_minutes = 150, updated_at = now(), version = version + 1
where key in ('day1','day2') and duration_minutes = 120;

create or replace function public.fn_phase_control(
  p_phase_key text,
  p_action text,
  p_extend_minutes integer default 0
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_phase public.phases%rowtype;
  v_action text := lower(trim(p_action));
  v_duration integer;
  v_remaining integer;
  v_log_action text;
begin
  if not public.is_admin() then raise exception 'PERMISSION_DENIED'; end if;

  select * into v_phase from public.phases where key = p_phase_key for update;
  if not found then raise exception 'PHASE_NOT_FOUND'; end if;

  v_duration := case
    when p_phase_key in ('day1','day2') then coalesce(
      (select (value #>> '{}')::integer from public.game_config where key='bonding_session_duration'),
      v_phase.duration_minutes, 150)
    else v_phase.duration_minutes
  end;
  if v_duration <= 0 then raise exception 'INVALID_SESSION_DURATION'; end if;

  if v_action in ('start','resume') and exists (
    select 1 from public.phases
    where id <> v_phase.id and state in ('active','paused')
  ) then
    raise exception 'ANOTHER_SESSION_ACTIVE';
  end if;

  if v_action = 'start' then
    if v_phase.state in ('active','paused') then raise exception 'SESSION_ALREADY_RUNNING'; end if;
    update public.phases set
      duration_minutes=v_duration, state='active', started_at=now(),
      ends_at=now()+make_interval(mins=>v_duration), paused_at=null,
      paused_remaining=null, updated_by=auth.uid(), updated_at=now(), version=version+1
    where id=v_phase.id;
    v_log_action := 'TIMER_STARTED';
  elsif v_action = 'pause' then
    if v_phase.state <> 'active' then raise exception 'NOT_ACTIVE'; end if;
    v_remaining := greatest(0, extract(epoch from (v_phase.ends_at-now()))::integer);
    update public.phases set state='paused', paused_at=now(),
      paused_remaining=v_remaining, updated_by=auth.uid(), updated_at=now(), version=version+1
    where id=v_phase.id;
    v_log_action := 'TIMER_PAUSED';
  elsif v_action = 'resume' then
    if v_phase.state <> 'paused' then raise exception 'NOT_PAUSED'; end if;
    update public.phases set state='active',
      ends_at=now()+make_interval(secs=>greatest(0,coalesce(v_phase.paused_remaining,0))),
      paused_at=null, paused_remaining=null, updated_by=auth.uid(), updated_at=now(), version=version+1
    where id=v_phase.id;
    v_log_action := 'TIMER_RESUMED';
  elsif v_action = 'extend' then
    if p_extend_minutes <= 0 then raise exception 'INVALID_EXTENSION'; end if;
    if v_phase.state = 'active' then
      update public.phases set ends_at=ends_at+make_interval(mins=>p_extend_minutes),
        updated_by=auth.uid(), updated_at=now(), version=version+1 where id=v_phase.id;
    elsif v_phase.state = 'paused' then
      update public.phases set paused_remaining=coalesce(paused_remaining,0)+(p_extend_minutes*60),
        updated_by=auth.uid(), updated_at=now(), version=version+1 where id=v_phase.id;
    else raise exception 'SESSION_NOT_RUNNING';
    end if;
    v_log_action := 'TIMER_EXTENDED';
  elsif v_action = 'reset' then
    update public.phases set duration_minutes=v_duration, state='pending', started_at=null,
      ends_at=null, paused_at=null, paused_remaining=null, updated_by=auth.uid(),
      updated_at=now(), version=version+1 where id=v_phase.id;
    v_log_action := 'TIMER_RESET';
  elsif v_action = 'end' then
    update public.phases set state='ended', ends_at=now(), paused_at=null,
      paused_remaining=null, updated_by=auth.uid(), updated_at=now(), version=version+1
    where id=v_phase.id;
    v_log_action := 'SESSION_ENDED';
  else raise exception 'UNKNOWN_ACTION';
  end if;

  insert into public.session_control_log(
    phase_id,phase_key,action,previous_state,new_state,seconds_changed,actor_user_id)
  select id,key,v_log_action,v_phase.state,state,
    case when v_action='extend' then p_extend_minutes*60 else 0 end,auth.uid()
  from public.phases where id=v_phase.id;

  perform public.audit('session.'||v_action,'phase:'||p_phase_key,
    jsonb_build_object('extend_minutes',p_extend_minutes,'previous_state',v_phase.state));

  return (select jsonb_build_object('ok',true,'phase_key',key,'state',state,
    'version',version) from public.phases where id=v_phase.id);
end;
$$;

-- Converts elapsed ACTIVE sessions to ENDED. The row lock and conditional
-- update ensure concurrent clients create only one SESSION_ENDED log.
create or replace function public.fn_finalize_expired_sessions()
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count integer := 0; v_row record;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  for v_row in
    update public.phases set state='ended', updated_at=now(), version=version+1
    where state='active' and ends_at is not null and ends_at <= now()
    returning id,key
  loop
    v_count := v_count+1;
    insert into public.session_control_log(
      phase_id,phase_key,action,previous_state,new_state,actor_user_id)
    values(v_row.id,v_row.key,'SESSION_ENDED','active','ended',null);
    perform public.audit('session.auto_end','phase:'||v_row.key,'{}'::jsonb);
  end loop;
  return v_count;
end;
$$;

create or replace function public.session_action_allowed(p_day integer, p_action_type text default null)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case p_day when 1 then public.phase_active('day1')
                    when 2 then public.phase_active('day2') else false end;
$$;

grant execute on function public.fn_phase_control(text,text,integer) to authenticated;
grant execute on function public.fn_finalize_expired_sessions() to authenticated;
grant execute on function public.session_action_allowed(integer,text) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.session_control_log;
exception when duplicate_object then null; end $$;
