-- Usability follow-up: fix GM station lookup, independent day timers, and
-- per-piece Puzzle artwork. Run after 0035.

-- PostgreSQL does not implicitly resolve an integer RPC argument to the
-- existing smallint overload. Gameplay functions call my_station_id(1/2),
-- so provide the exact signature they request.
create or replace function public.my_station_id(p_day integer)
returns integer language sql stable security definer set search_path=public as $$
  select public.my_station_id(p_day::smallint)
$$;
grant execute on function public.my_station_id(integer) to authenticated;

insert into public.game_setting_definitions(setting_key,value_type,min_value,description) values
 ('bonding_session_duration_day1','integer',1,'Day 1 bonding-session duration in minutes'),
 ('bonding_session_duration_day2','integer',1,'Day 2 bonding-session duration in minutes')
on conflict(setting_key) do update set value_type=excluded.value_type,min_value=excluded.min_value,description=excluded.description;
insert into public.game_config(key,value)
select 'bonding_session_duration_day1',coalesce((select value from public.game_config where key='bonding_session_duration'),'150'::jsonb)
on conflict(key) do nothing;
insert into public.game_config(key,value)
select 'bonding_session_duration_day2',coalesce((select value from public.game_config where key='bonding_session_duration'),'150'::jsonb)
on conflict(key) do nothing;

create or replace function public.can_manage_game_setting(p_key text) returns boolean language sql stable security definer set search_path=public as $$
 select public.has_permission('configuration.manage') or (public.has_permission('configuration.gameplay.manage') and p_key in(
 'day1_win_reward','day1_lose_reward','allow_station_replay','max_station_attempts','puzzle_pool_exhaustion_policy',
 'bonding_session_duration_day1','bonding_session_duration_day2')) $$;

create or replace function public.fn_phase_control(p_phase_key text,p_action text,p_extend_minutes integer default 0)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_phase public.phases%rowtype;v_action text:=lower(trim(p_action));v_duration integer;v_remaining integer;v_log_action text;v_duration_key text;
begin
 if not public.is_admin() then raise exception 'PERMISSION_DENIED';end if;
 select * into v_phase from public.phases where key=p_phase_key for update;if not found then raise exception 'PHASE_NOT_FOUND';end if;
 v_duration_key:=case p_phase_key when 'day1' then 'bonding_session_duration_day1' when 'day2' then 'bonding_session_duration_day2' else null end;
 v_duration:=case when v_duration_key is not null then coalesce((select(value#>>'{}')::integer from public.game_config where key=v_duration_key),v_phase.duration_minutes,150) else v_phase.duration_minutes end;
 if v_duration<=0 then raise exception 'INVALID_SESSION_DURATION';end if;
 if v_action in('start','resume') and exists(select 1 from public.phases where id<>v_phase.id and state in('active','paused')) then raise exception 'ANOTHER_SESSION_ACTIVE';end if;
 if v_action='start' then if v_phase.state in('active','paused') then raise exception 'SESSION_ALREADY_RUNNING';end if;update public.phases set duration_minutes=v_duration,state='active',started_at=now(),ends_at=now()+make_interval(mins=>v_duration),paused_at=null,paused_remaining=null,updated_by=auth.uid(),updated_at=now(),version=version+1 where id=v_phase.id;v_log_action:='TIMER_STARTED';
 elsif v_action='pause' then if v_phase.state<>'active' then raise exception 'NOT_ACTIVE';end if;v_remaining:=greatest(0,extract(epoch from(v_phase.ends_at-now()))::integer);update public.phases set state='paused',paused_at=now(),paused_remaining=v_remaining,updated_by=auth.uid(),updated_at=now(),version=version+1 where id=v_phase.id;v_log_action:='TIMER_PAUSED';
 elsif v_action='resume' then if v_phase.state<>'paused' then raise exception 'NOT_PAUSED';end if;update public.phases set state='active',ends_at=now()+make_interval(secs=>greatest(0,coalesce(v_phase.paused_remaining,0))),paused_at=null,paused_remaining=null,updated_by=auth.uid(),updated_at=now(),version=version+1 where id=v_phase.id;v_log_action:='TIMER_RESUMED';
 elsif v_action='extend' then if p_extend_minutes<=0 then raise exception 'INVALID_EXTENSION';end if;if v_phase.state='active' then update public.phases set ends_at=ends_at+make_interval(mins=>p_extend_minutes),updated_by=auth.uid(),updated_at=now(),version=version+1 where id=v_phase.id;elsif v_phase.state='paused' then update public.phases set paused_remaining=coalesce(paused_remaining,0)+(p_extend_minutes*60),updated_by=auth.uid(),updated_at=now(),version=version+1 where id=v_phase.id;else raise exception 'SESSION_NOT_RUNNING';end if;v_log_action:='TIMER_EXTENDED';
 elsif v_action='reset' then update public.phases set duration_minutes=v_duration,state='pending',started_at=null,ends_at=null,paused_at=null,paused_remaining=null,updated_by=auth.uid(),updated_at=now(),version=version+1 where id=v_phase.id;v_log_action:='TIMER_RESET';
 elsif v_action='end' then update public.phases set state='ended',ends_at=now(),paused_at=null,paused_remaining=null,updated_by=auth.uid(),updated_at=now(),version=version+1 where id=v_phase.id;v_log_action:='SESSION_ENDED';else raise exception 'UNKNOWN_ACTION';end if;
 insert into public.session_control_log(phase_id,phase_key,action,previous_state,new_state,seconds_changed,actor_user_id) select id,key,v_log_action,v_phase.state,state,case when v_action='extend' then p_extend_minutes*60 else 0 end,auth.uid() from public.phases where id=v_phase.id;
 perform public.audit('session.'||v_action,'phase:'||p_phase_key,jsonb_build_object('extend_minutes',p_extend_minutes,'previous_state',v_phase.state));
 return(select jsonb_build_object('ok',true,'phase_key',key,'state',state,'version',version) from public.phases where id=v_phase.id);
end $$;

alter table public.items add column if not exists display_asset text;
create or replace function public.fn_admin_set_puzzle_asset(p_puzzle_id integer,p_asset_url text)
returns jsonb language plpgsql security definer set search_path=public as $$ begin
 if not public.has_permission('puzzle.manage') then raise exception 'PERMISSION_DENIED';end if;
 if nullif(trim(p_asset_url),'') is null then raise exception 'INVALID_ASSET_URL';end if;
 update public.items set display_asset=trim(p_asset_url) where id=p_puzzle_id and type='puzzle';if not found then raise exception 'PUZZLE_NOT_FOUND';end if;
 perform public.audit('puzzle.asset_update','puzzle:'||p_puzzle_id,jsonb_build_object('asset_url',p_asset_url));return jsonb_build_object('ok',true);
end $$;
revoke all on function public.fn_admin_set_puzzle_asset(integer,text) from public,anon;
grant execute on function public.fn_admin_set_puzzle_asset(integer,text) to authenticated;

drop function if exists public.fn_my_puzzle_inventory();
create function public.fn_my_puzzle_inventory()
returns table(inventory_id bigint,status text,obtained_at timestamptz,redeemed_at timestamptz,puzzle_id integer,puzzle_code text,puzzle_name text,puzzle_location public.projector_location,puzzle_index integer,display_asset text)
language plpgsql stable security definer set search_path=public as $$ declare v_group_id integer;begin
 if auth.uid() is null or public.my_role() not in('faci','freshie') or not public.has_permission('inventory.view') then raise exception 'PERMISSION_DENIED';end if;
 v_group_id:=public.current_gameplay_group_id();if v_group_id is null then raise exception 'GROUP_NOT_ASSIGNED';end if;
 return query select inv.id,inv.status,inv.created_at,inv.redeemed_at,i.id,i.puzzle_code,i.name,i.puzzle_location,i.puzzle_index,i.display_asset from public.inventory inv join public.items i on i.id=inv.item_id where inv.group_id=v_group_id and inv.item_type='puzzle' order by inv.created_at desc;
end $$;
revoke all on function public.fn_my_puzzle_inventory() from public,anon;
grant execute on function public.fn_my_puzzle_inventory() to authenticated;
