-- Restore distinct management roles while keeping Guardian GM as an assignment.
alter table public.profiles drop constraint if exists profiles_role_four_allowed;
alter table public.profiles drop constraint if exists profiles_admin_team_valid;
alter table public.profiles add constraint profiles_role_allowed check(role in('freshie','faci','gm','committee','hof','hogm','admin'));

-- Migrate the temporary Admin-team labels created during the four-role phase.
update public.profiles set role=case admin_team when 'HOF' then 'hof'::public.user_role when 'HOGM' then 'hogm'::public.user_role else role end
where role='admin' and admin_team in('HOF','HOGM');
update public.profiles set admin_team=case role when 'hof' then 'HOF' when 'hogm' then 'HOGM' when 'admin' then 'TECH' else null end;
update auth.users u set raw_app_meta_data=jsonb_set(coalesce(u.raw_app_meta_data,'{}'::jsonb),'{role}',to_jsonb(p.role::text),true)
from public.profiles p where p.id=u.id;

alter table public.role_permissions drop constraint if exists role_permissions_role_check;
delete from public.role_permissions;
insert into public.role_permissions(role,permission) values
 ('freshie','dashboard.view'),('freshie','inventory.view'),('freshie','map.view'),('freshie','group.locations.view_own'),
 ('faci','dashboard.view'),('faci','inventory.view'),('faci','map.view'),('faci','map.update'),('faci','lighting.view'),('faci','timer.view'),('faci','group.resources.view'),('faci','blindbox.claim'),('faci','blindbox.open'),('faci','nfc.scan'),('faci','attendance.manage'),('faci','token.view'),('faci','token.undo.own'),
 ('gm','dashboard.view'),('gm','map.view'),('gm','gameplay.day1'),('gm','gameplay.day2'),('gm','timer.view'),('gm','token.view'),('gm','token.play'),('gm','token.undo.own'),
 ('committee','dashboard.view'),('committee','management.access'),('committee','operations.manage'),('committee','map.view'),('committee','group.locations.view_all'),('committee','token.view_all'),('committee','attendance.view_all'),('committee','lighting.view'),('committee','timer.view'),('committee','bigscreen.view'),('committee','token.undo.own'),
 ('hof','dashboard.view'),('hof','management.access'),('hof','operations.manage'),('hof','accounts.view'),('hof','allocation.faci.manage'),('hof','map.view'),('hof','group.locations.view_all'),('hof','attendance.view_all'),('hof','token.view_all'),('hof','token.manage'),('hof','token.correct.any'),('hof','correction_reasons.manage'),('hof','logs.token'),('hof','logs.puzzle'),('hof','logs.game'),('hof','logs.audit'),('hof','puzzle.manage'),('hof','lighting.view'),('hof','timer.view'),('hof','bigscreen.view'),('hof','token.undo.own'),
 ('hogm','dashboard.view'),('hogm','management.access'),('hogm','operations.manage'),('hogm','accounts.view'),('hogm','allocation.manage'),('hogm','allocation.gm.manage'),('hogm','guardian.manage'),('hogm','stations.manage'),('hogm','gameplay.manage'),('hogm','configuration.gameplay.manage'),('hogm','gameplay.day1'),('hogm','gameplay.day2'),('hogm','map.view'),('hogm','group.locations.view_all'),('hogm','token.view_all'),('hogm','token.manage'),('hogm','token.presets.manage'),('hogm','token.correct.any'),('hogm','correction_reasons.manage'),('hogm','logs.token'),('hogm','logs.puzzle'),('hogm','logs.game'),('hogm','logs.audit'),('hogm','puzzle.manage'),('hogm','lighting.view'),('hogm','timer.view'),('hogm','bigscreen.view'),('hogm','token.undo.own'),
 ('admin','dashboard.view'),('admin','admin.access'),('admin','management.access'),('admin','operations.manage'),('admin','accounts.view'),('admin','accounts.manage'),('admin','allocation.manage'),('admin','allocation.faci.manage'),('admin','allocation.gm.manage'),('admin','guardian.manage'),('admin','stations.manage'),('admin','gameplay.manage'),('admin','configuration.manage'),('admin','configuration.gameplay.manage'),('admin','timer.manage'),('admin','logs.token'),('admin','logs.puzzle'),('admin','logs.blindbox'),('admin','logs.nfc'),('admin','logs.game'),('admin','logs.audit'),('admin','puzzle.manage'),('admin','corrections.manage'),('admin','correction_reasons.manage'),('admin','nfc.recovery'),('admin','map.view'),('admin','group.locations.view_all'),('admin','lighting.view'),('admin','timer.view'),('admin','token.view'),('admin','token.view_all'),('admin','token.play'),('admin','token.manage'),('admin','token.presets.manage'),('admin','token.correct.any'),('admin','bigscreen.view'),('admin','token.undo.own');

create or replace function public.is_committee() returns boolean language sql stable security definer set search_path=public as $$ select public.my_role() in('committee','hof','hogm','admin') $$;

create table if not exists public.guardian_gm_assignments(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 assigned_by uuid not null references public.profiles(id), assigned_at timestamptz not null default now(), version bigint not null default 1);
alter table public.guardian_gm_assignments enable row level security;
create policy "management reads guardian assignments" on public.guardian_gm_assignments for select using(public.has_permission('guardian.manage') or user_id=auth.uid());
drop policy if exists "hogm manages stations" on public.stations;
create policy "hogm manages stations" on public.stations for all using(public.has_permission('stations.manage')) with check(public.has_permission('stations.manage'));

create or replace function public.has_permission(p_permission text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.role_permissions where role=public.my_role() and permission=p_permission)
 or (p_permission='gameplay.puzzle_verify' and exists(select 1 from public.guardian_gm_assignments where user_id=auth.uid())) $$;

create or replace function public.fn_set_guardian_gm(p_user_id uuid,p_enabled boolean,p_reason text default null) returns jsonb
language plpgsql security definer set search_path=public as $$ begin
 if not public.has_permission('guardian.manage') then raise exception 'PERMISSION_DENIED'; end if;
 if not exists(select 1 from public.profiles where id=p_user_id and role='gm') then raise exception 'GM_ACCOUNT_NOT_FOUND'; end if;
 if p_enabled then insert into public.guardian_gm_assignments(user_id,assigned_by) values(p_user_id,auth.uid()) on conflict(user_id) do update set assigned_by=auth.uid(),assigned_at=now(),version=guardian_gm_assignments.version+1;
 else delete from public.guardian_gm_assignments where user_id=p_user_id; end if;
 perform public.audit('allocation.guardian_gm','user:'||p_user_id,jsonb_build_object('enabled',p_enabled,'reason',p_reason));
 return jsonb_build_object('ok',true,'enabled',p_enabled); end $$;

create or replace function public.fn_admin_assign_faci(p_user_id uuid,p_group_id integer,p_expected_version bigint default 0,p_reason text default null) returns jsonb
language plpgsql security definer set search_path=public as $$ declare v_old integer;v_version bigint; begin
 if not public.has_permission('allocation.faci.manage') then raise exception 'PERMISSION_DENIED'; end if;
 if not exists(select 1 from public.profiles where id=p_user_id and role='faci') then raise exception 'FACI_ACCOUNT_NOT_FOUND'; end if;
 if p_group_id is not null and not exists(select 1 from public.groups where id=p_group_id and is_active) then raise exception 'INVALID_GROUP_ASSIGNMENT'; end if;
 select group_id,version into v_old,v_version from public.user_group_assignments where user_id=p_user_id for update;
 if found and v_version<>p_expected_version or not found and coalesce(p_expected_version,0)<>0 then raise exception 'ALLOCATION_CONFLICT'; end if;
 if p_group_id is null then delete from public.user_group_assignments where user_id=p_user_id and version=p_expected_version;
 elsif v_version is null then insert into public.user_group_assignments(user_id,group_id,source,created_by,updated_by) values(p_user_id,p_group_id,'management',auth.uid(),auth.uid());
 else update public.user_group_assignments set group_id=p_group_id,source='management',updated_by=auth.uid() where user_id=p_user_id and version=p_expected_version; if not found then raise exception 'ALLOCATION_CONFLICT'; end if; end if;
 if v_old is distinct from p_group_id then insert into public.allocation_audit(user_id,role,old_group_id,new_group_id,edited_by,reason) values(p_user_id,'faci',v_old,p_group_id,auth.uid(),p_reason); end if;
 select version into v_version from public.user_group_assignments where user_id=p_user_id; return jsonb_build_object('ok',true,'version',coalesce(v_version,0)); end $$;

-- Keep the existing concurrency-safe GM implementation, but narrow its entry permission.
create or replace function public.can_manage_gm_allocations() returns boolean language sql stable security definer set search_path=public as $$ select public.has_permission('allocation.gm.manage') $$;

-- Freshies have a read-only group view. Valuable participant actions belong
-- to the assigned Faci, and are checked again here rather than relying on
-- hidden buttons in the browser.
alter function public.fn_claim_blind_box_source(text,text) rename to fn_claim_blind_box_source_unchecked;
create function public.fn_claim_blind_box_source(p_qr_hash text,p_request_id text) returns jsonb
language plpgsql security definer set search_path=public as $$ begin
 if public.my_role()<>'faci' or not public.has_permission('blindbox.claim') then raise exception 'PERMISSION_DENIED';end if;
 return public.fn_claim_blind_box_source_unchecked(p_qr_hash,p_request_id);end $$;
alter function public.fn_open_blind_box(text,text) rename to fn_open_blind_box_unchecked;
create function public.fn_open_blind_box(p_blind_box_id text,p_request_id text) returns jsonb
language plpgsql security definer set search_path=public as $$ begin
 if public.my_role()<>'faci' or not public.has_permission('blindbox.open') then raise exception 'PERMISSION_DENIED';end if;
 return public.fn_open_blind_box_unchecked(p_blind_box_id,p_request_id);end $$;
revoke all on function public.fn_claim_blind_box_source_unchecked(text,text),public.fn_open_blind_box_unchecked(text,text),public.fn_scan_blind_box(text) from public,anon,authenticated;
revoke all on function public.fn_claim_blind_box_source(text,text),public.fn_open_blind_box(text,text) from public,anon;
grant execute on function public.fn_claim_blind_box_source(text,text),public.fn_open_blind_box(text,text) to authenticated;

create or replace function public.fn_current_user_context() returns table(user_id uuid,role public.user_role,group_id integer,station_id integer,day smallint,admin_team text,permissions text[])
language sql stable security definer set search_path=public as $$ select p.id,p.role,uga.group_id,gsa.station_id,public.current_game_day(),p.admin_team,
 coalesce((select array_agg(rp.permission order by rp.permission) from public.role_permissions rp where rp.role=p.role),array[]::text[])
 || case when exists(select 1 from public.guardian_gm_assignments gg where gg.user_id=p.id) then array['gameplay.puzzle_verify']::text[] else array[]::text[] end
 from public.profiles p left join public.user_group_assignments uga on uga.user_id=p.id left join public.gm_station_assignments gsa on gsa.user_id=p.id and gsa.day=public.current_game_day()
 where p.id=auth.uid() and p.role in('freshie','faci','gm','committee','hof','hogm','admin') $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ declare v_role public.user_role; begin
 if new.raw_app_meta_data->>'role' is null then raise exception 'STAFF_INVITE_REQUIRED'; end if; v_role:=(new.raw_app_meta_data->>'role')::public.user_role;
 if v_role not in('faci','gm','committee','hof','hogm','admin') then raise exception 'INVALID_ROLE'; end if;
 insert into public.profiles(id,role,full_name,student_id,email,phone,username,admin_team) values(new.id,v_role,coalesce(new.raw_user_meta_data->>'full_name',''),new.raw_user_meta_data->>'student_id',new.email,new.raw_user_meta_data->>'phone',nullif(new.raw_user_meta_data->>'username',''),case v_role when 'hof' then 'HOF' when 'hogm' then 'HOGM' when 'admin' then 'TECH' end) on conflict(id) do nothing; return new; end $$;

-- Override GM allocation function's broad legacy permission at its source.
-- The function remains otherwise unchanged; HOGM and Tech are the only roles granted this permission.
revoke all on function public.fn_set_guardian_gm(uuid,boolean,text) from public,anon;
grant execute on function public.fn_set_guardian_gm(uuid,boolean,text) to authenticated;
grant select on public.guardian_gm_assignments to authenticated;
do $$ begin alter publication supabase_realtime add table public.guardian_gm_assignments; exception when duplicate_object then null; end $$;

-- HOGM may change gameplay values only; Tech retains every configuration key.
create or replace function public.can_manage_game_setting(p_key text) returns boolean language sql stable security definer set search_path=public as $$
 select public.has_permission('configuration.manage') or (public.has_permission('configuration.gameplay.manage') and p_key in(
 'day1_win_reward','day1_lose_reward','allow_station_replay','max_station_attempts','puzzle_pool_exhaustion_policy')) $$;

-- The shared token preset editor stores JSON in description because
-- game_config_rules.rule_value is numeric. Everyone who consumes Token rules
-- may read them, but only HOGM and Tech may directly change the preset row.
drop policy if exists "permitted users read token rules" on public.game_config_rules;
drop policy if exists "admin manages token rules" on public.game_config_rules;
drop policy if exists "role scoped token preset insert" on public.game_config_rules;
drop policy if exists "role scoped token preset update" on public.game_config_rules;
drop policy if exists "role scoped token preset delete" on public.game_config_rules;
create policy "permitted users read token rules" on public.game_config_rules for select
 using(auth.uid() is not null and (public.has_permission('token.view') or public.has_permission('token.play') or public.has_permission('token.manage') or public.has_permission('token.view_all')));
create policy "role scoped token preset insert" on public.game_config_rules for insert
 with check(rule_key='APP_TOKEN_PRESETS_JSON' and public.has_permission('token.presets.manage'));
create policy "role scoped token preset update" on public.game_config_rules for update
 using(rule_key='APP_TOKEN_PRESETS_JSON' and public.has_permission('token.presets.manage'))
 with check(rule_key='APP_TOKEN_PRESETS_JSON' and public.has_permission('token.presets.manage'));
create policy "role scoped token preset delete" on public.game_config_rules for delete
 using(rule_key='APP_TOKEN_PRESETS_JSON' and public.has_permission('token.presets.manage'));
revoke all on public.game_config_rules from anon;
grant select,insert,update,delete on public.game_config_rules to authenticated;

create or replace function public.fn_admin_set_game_setting(p_key text,p_value jsonb,p_expected_version bigint default 0,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$ declare oldv jsonb;current_version bigint;minv integer;maxv integer; begin
 if not public.can_manage_game_setting(p_key) then raise exception 'PERMISSION_DENIED'; end if;
 perform public.validate_game_setting(p_key,p_value);select value,version into oldv,current_version from public.game_config where key=p_key for update;
 if found and current_version<>p_expected_version then raise exception 'CONFIGURATION_CONFLICT'; elsif not found and coalesce(p_expected_version,0)<>0 then raise exception 'CONFIGURATION_CONFLICT'; end if;
 if current_version is null then insert into public.game_config(key,value,updated_by,version) values(p_key,p_value,auth.uid(),1);current_version:=1;
 else update public.game_config set value=p_value,updated_by=auth.uid(),updated_at=now(),version=version+1 where key=p_key;current_version:=current_version+1;end if;
 select coalesce((select(value#>>'{}')::integer from public.game_config where key='blind_box_normal_reward_min'),0),coalesce((select(value#>>'{}')::integer from public.game_config where key='blind_box_normal_reward_max'),0) into minv,maxv;if minv>maxv then raise exception 'MINIMUM_REWARD_EXCEEDS_MAXIMUM';end if;
 select coalesce((select(value#>>'{}')::integer from public.game_config where key='blind_box_special_reward_min'),0),coalesce((select(value#>>'{}')::integer from public.game_config where key='blind_box_special_reward_max'),0) into minv,maxv;if minv>maxv then raise exception 'MINIMUM_REWARD_EXCEEDS_MAXIMUM';end if;
 if p_key in('day1_win_reward','day1_lose_reward') then insert into public.game_config_rules(day,rule_key,rule_value,description,updated_at) values(1,case p_key when 'day1_win_reward' then 'DAY1_WIN_TOKENS' else 'DAY1_LOSE_TOKENS' end,(p_value#>>'{}')::integer,'Synchronized from configuration',now()) on conflict(rule_key) do update set rule_value=excluded.rule_value,updated_at=now();end if;
 insert into public.configuration_history(setting_key,old_value,new_value,edited_by,reason) values(p_key,oldv,p_value,auth.uid(),nullif(trim(coalesce(p_reason,'')),''));perform public.audit('configuration.update','setting:'||p_key,jsonb_build_object('old',oldv,'new',p_value));return jsonb_build_object('ok',true,'key',p_key,'value',p_value,'version',current_version);end $$;

create or replace function public.fn_admin_set_station_config(p_station_id integer,p_difficulty text,p_token_cost integer,p_exclusion_limit integer,p_is_active boolean,p_expected_version bigint,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$ declare oldv jsonb;newver bigint;begin
 if not(public.has_permission('configuration.manage') or public.has_permission('stations.manage')) then raise exception 'PERMISSION_DENIED';end if;
 if upper(p_difficulty) not in('EASY','MEDIUM','HARD') or p_token_cost<0 or p_exclusion_limit<0 then raise exception 'INVALID_STATION_CONFIGURATION';end if;
 select to_jsonb(s),config_version into oldv,newver from public.stations s where id=p_station_id for update;if not found then raise exception 'STATION_NOT_FOUND';end if;if newver<>p_expected_version then raise exception 'CONFIGURATION_CONFLICT';end if;
 update public.stations set difficulty=upper(p_difficulty),token_cost=p_token_cost,location_exclusion_limit=p_exclusion_limit,is_active=p_is_active,updated_by=auth.uid(),updated_at=now(),config_version=config_version+1 where id=p_station_id;
 insert into public.configuration_history(station_id,old_value,new_value,edited_by,reason) select p_station_id,oldv,to_jsonb(s),auth.uid(),nullif(trim(coalesce(p_reason,'')),'') from public.stations s where id=p_station_id;perform public.audit('configuration.station','station:'||p_station_id,jsonb_build_object('old',oldv));return jsonb_build_object('ok',true,'station_id',p_station_id,'version',newver+1);end $$;

create table if not exists public.correction_reason_presets(reason_id bigserial primary key,label text not null unique,is_active boolean not null default true,sort_order integer not null default 0,updated_by uuid references public.profiles(id),updated_at timestamptz not null default now());
insert into public.correction_reason_presets(label,sort_order) values('Wrong group number selected',10),('Wrong Token amount selected',20),('Wrong result announced',30),('Duplicate transaction',40),('Station selected incorrectly',50),('Gameplay result corrected',60),('Technical recovery',70),('Other',999) on conflict(label) do nothing;
alter table public.correction_reason_presets enable row level security;
create policy "management reads correction reasons" on public.correction_reason_presets for select using(public.has_permission('token.correct.any'));
create policy "authorized manages correction reasons" on public.correction_reason_presets for all using(public.has_permission('correction_reasons.manage')) with check(public.has_permission('correction_reasons.manage'));
grant select,insert,update on public.correction_reason_presets to authenticated;
grant usage,select on sequence public.correction_reason_presets_reason_id_seq to authenticated;

create or replace function public.fn_undo_last_transaction() returns jsonb language plpgsql security definer set search_path=public as $$ declare v_old public.token_logs%rowtype;v_result jsonb;v_reverse_id uuid;begin
 if not public.has_permission('token.undo.own') then raise exception 'PERMISSION_DENIED';end if;
 select * into v_old from public.token_logs where actor_user_id=auth.uid() order by created_at desc limit 1 for update;
 if not found or v_old.reversed_by is not null or v_old.transaction_type in('TOKEN_REVERSAL','TOKEN_CORRECTION') then raise exception 'NOTHING_TO_UNDO';end if;
 v_result:=public.fn_token_apply_unchecked(v_old.group_id,-v_old.amount,'TOKEN_REVERSAL','QUICK_UNDO','quick-undo:'||v_old.log_id,v_old.station_id,v_old.bonding_day,'Quick undo of '||v_old.log_id,false);v_reverse_id:=(v_result->>'log_id')::uuid;
 update public.token_logs set reversed_by=v_reverse_id,correction_reason='Quick undo by original actor' where log_id=v_old.log_id;perform public.audit('tokens.quick_undo','token_log:'||v_old.log_id,jsonb_build_object('reversal_log_id',v_reverse_id));return jsonb_build_object('ok',true,'reversed_log_id',v_old.log_id,'reversal_log_id',v_reverse_id,'balance',v_result->'balance');end $$;
