-- fn_phase_control as installed on the live database: bonding-session branch,
-- supabase/migrations/0036_usability_and_gameplay_fixes.sql (copied unchanged).
-- Used by tests/game-lead/bonding.test.ts; this repo's own 0003 version differs.
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
