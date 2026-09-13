-- Section 5 compatibility: synchronize canonical station values with the
-- teammate token module's risk_tier and entry_cost fields.
create or replace function public.fn_admin_set_station_config(
 p_station_id integer,p_difficulty text,p_token_cost integer,p_exclusion_limit integer,
 p_is_active boolean,p_expected_version bigint,p_reason text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare oldv jsonb; newver bigint; tier public.risk_tier;
begin
 if not public.has_permission('configuration.manage') then raise exception 'PERMISSION_DENIED'; end if;
 if upper(p_difficulty) not in ('EASY','MEDIUM','HARD') or p_token_cost<0 or p_exclusion_limit<0 then raise exception 'INVALID_STATION_CONFIGURATION'; end if;
 tier:=case upper(p_difficulty) when 'EASY' then 'low'::public.risk_tier when 'MEDIUM' then 'medium'::public.risk_tier else 'high'::public.risk_tier end;
 select to_jsonb(s),config_version into oldv,newver from public.stations s where id=p_station_id for update;
 if not found then raise exception 'ST_NOT_FOUND'; end if;
 if newver<>p_expected_version then raise exception 'CONFIGURATION_CONFLICT'; end if;
 update public.stations set difficulty=upper(p_difficulty),token_cost=p_token_cost,
  risk_tier=tier,entry_cost=p_token_cost,location_exclusion_limit=p_exclusion_limit,
  is_active=p_is_active,updated_by=auth.uid(),updated_at=now(),config_version=config_version+1 where id=p_station_id;
 insert into public.configuration_history(station_id,old_value,new_value,edited_by,reason)
  select p_station_id,oldv,to_jsonb(s),auth.uid(),nullif(trim(coalesce(p_reason,'')),'') from public.stations s where id=p_station_id;
 perform public.audit('configuration.station','station:'||p_station_id,jsonb_build_object('old',oldv));
 return jsonb_build_object('ok',true,'station_id',p_station_id,'version',newver+1);
end $$;
revoke all on function public.fn_admin_set_station_config(integer,text,integer,integer,boolean,bigint,text) from public,anon;
grant execute on function public.fn_admin_set_station_config(integer,text,integer,integer,boolean,bigint,text) to authenticated;
