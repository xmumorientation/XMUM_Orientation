-- Section 5: Admin-editable gameplay configuration.
-- Single-orientation schema: no event_id columns are required.

alter table public.game_config add column if not exists version bigint not null default 1;
alter table public.stations add column if not exists day smallint check (day in (1, 2));
alter table public.stations add column if not exists difficulty text;
alter table public.stations add column if not exists token_cost integer not null default 0 check (token_cost >= 0);
alter table public.stations add column if not exists location_exclusion_limit integer not null default 0 check (location_exclusion_limit >= 0);
alter table public.stations add column if not exists is_active boolean not null default true;
alter table public.stations add column if not exists config_version bigint not null default 1;
alter table public.stations add column if not exists updated_at timestamptz not null default now();
alter table public.stations add column if not exists updated_by uuid references public.profiles(id);

create table if not exists public.game_setting_definitions (
  setting_key text primary key,
  value_type text not null check (value_type in ('integer', 'boolean', 'text')),
  min_value numeric,
  max_value numeric,
  allowed_values jsonb,
  description text not null default ''
);

create table if not exists public.configuration_history (
  id bigserial primary key,
  setting_key text,
  station_id integer references public.stations(id),
  old_value jsonb,
  new_value jsonb not null,
  edited_by uuid not null references public.profiles(id),
  edited_at timestamptz not null default now(),
  reason text,
  check ((setting_key is null) <> (station_id is null))
);

insert into public.game_setting_definitions
  (setting_key, value_type, min_value, max_value, allowed_values, description)
values
  ('day1_win_reward','integer',0,null,null,'Tokens awarded for a Day 1 win'),
  ('day1_lose_reward','integer',0,null,null,'Tokens awarded for a Day 1 loss'),
  ('blind_box_gm_claim_cost','integer',0,null,null,'Tokens charged at a GM source'),
  ('blind_box_normal_reward_min','integer',0,null,null,'Normal reward minimum'),
  ('blind_box_normal_reward_max','integer',0,null,null,'Normal reward maximum'),
  ('blind_box_special_reward_min','integer',0,null,null,'Special reward minimum'),
  ('blind_box_special_reward_max','integer',0,null,null,'Special reward maximum'),
  ('blind_box_gm_total_claim_limit','integer',0,null,null,'Total GM claims allowed per group'),
  ('blind_box_source_claim_limit','integer',0,null,null,'Claims allowed per group and source'),
  ('blind_box_oc_team_default_stock','integer',0,null,null,'Default OC Team source stock'),
  ('blind_box_hof_default_stock','integer',0,null,null,'Default HOF source stock'),
  ('blind_box_hogm_default_stock','integer',0,null,null,'Default HOGM source stock'),
  ('blind_box_gm_station_default_stock','integer',0,null,null,'Default GM station stock'),
  ('allow_station_replay','boolean',null,null,null,'Whether a group may replay a station'),
  ('max_station_attempts','integer',1,null,null,'Maximum station attempts'),
  ('allow_blind_box_open_after_session','boolean',null,null,null,'Whether boxes may open after session'),
  ('bonding_session_duration','integer',1,null,null,'Session duration in minutes'),
  ('puzzle_pool_exhaustion_policy','text',null,null,'["STOP","REUSE"]'::jsonb,'Behavior when puzzle pool is empty')
on conflict (setting_key) do update set
  value_type=excluded.value_type, min_value=excluded.min_value,
  max_value=excluded.max_value, allowed_values=excluded.allowed_values,
  description=excluded.description;

insert into public.game_config(key,value) values
  ('day1_win_reward','2'), ('day1_lose_reward','1'),
  ('blind_box_gm_claim_cost','2'),
  ('blind_box_normal_reward_min','1'), ('blind_box_normal_reward_max','2'),
  ('blind_box_special_reward_min','3'), ('blind_box_special_reward_max','5'),
  ('blind_box_gm_total_claim_limit','1'), ('blind_box_source_claim_limit','1'),
  ('blind_box_oc_team_default_stock','2'), ('blind_box_hof_default_stock','2'),
  ('blind_box_hogm_default_stock','2'), ('blind_box_gm_station_default_stock','5'),
  ('allow_station_replay','false'), ('max_station_attempts','1'),
  ('allow_blind_box_open_after_session','false'),
  ('bonding_session_duration','120'), ('puzzle_pool_exhaustion_policy','"STOP"')
on conflict (key) do nothing;

-- Preserve the teammate token module's existing rule interface.
update public.game_config c set value = to_jsonb(r.rule_value)
from public.game_config_rules r
where (c.key='day1_win_reward' and r.rule_key='DAY1_WIN_TOKENS')
   or (c.key='day1_lose_reward' and r.rule_key='DAY1_LOSE_TOKENS');

create or replace function public.validate_game_setting(p_key text, p_value jsonb)
returns void language plpgsql stable set search_path=public as $$
declare d public.game_setting_definitions%rowtype; n numeric; t text;
begin
  select * into d from public.game_setting_definitions where setting_key=p_key;
  if not found then raise exception 'UNKNOWN_CONFIGURATION_KEY'; end if;
  t := p_value #>> '{}';
  begin
    if d.value_type='integer' then n:=t::integer;
    elsif d.value_type='boolean' then perform t::boolean;
    elsif d.value_type='text' and d.allowed_values is not null
      and not d.allowed_values ? t then raise exception 'INVALID_CONFIGURATION_VALUE';
    end if;
  exception when invalid_text_representation then raise exception 'INVALID_CONFIGURATION_VALUE'; end;
  if n is not null and (n < d.min_value or n > d.max_value) then raise exception 'INVALID_CONFIGURATION_VALUE'; end if;
end $$;

create or replace function public.fn_admin_set_game_setting(
  p_key text, p_value jsonb, p_expected_version bigint default 0, p_reason text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare oldv jsonb; current_version bigint; minv integer; maxv integer;
begin
  if not public.has_permission('configuration.manage') then raise exception 'PERMISSION_DENIED'; end if;
  perform public.validate_game_setting(p_key,p_value);
  select value,version into oldv,current_version from public.game_config where key=p_key for update;
  if found and current_version<>p_expected_version then raise exception 'CONFIGURATION_CONFLICT';
  elsif not found and coalesce(p_expected_version,0)<>0 then raise exception 'CONFIGURATION_CONFLICT'; end if;
  if current_version is null then
    insert into public.game_config(key,value,updated_by,version) values(p_key,p_value,auth.uid(),1);
    current_version:=1;
  else
    update public.game_config set value=p_value,updated_by=auth.uid(),updated_at=now(),version=version+1 where key=p_key;
    current_version:=current_version+1;
  end if;
  select coalesce((select (value#>>'{}')::integer from public.game_config where key='blind_box_normal_reward_min'),0),
         coalesce((select (value#>>'{}')::integer from public.game_config where key='blind_box_normal_reward_max'),0)
    into minv,maxv;
  if minv>maxv then raise exception 'MINIMUM_REWARD_EXCEEDS_MAXIMUM'; end if;
  select coalesce((select (value#>>'{}')::integer from public.game_config where key='blind_box_special_reward_min'),0),
         coalesce((select (value#>>'{}')::integer from public.game_config where key='blind_box_special_reward_max'),0)
    into minv,maxv;
  if minv>maxv then raise exception 'MINIMUM_REWARD_EXCEEDS_MAXIMUM'; end if;
  if p_key in ('day1_win_reward','day1_lose_reward') then
    insert into public.game_config_rules(day,rule_key,rule_value,description,updated_at)
    values(1,case p_key when 'day1_win_reward' then 'DAY1_WIN_TOKENS' else 'DAY1_LOSE_TOKENS' end,
      (p_value#>>'{}')::integer,'Synchronized from Admin configuration',now())
    on conflict(rule_key) do update set rule_value=excluded.rule_value,updated_at=now();
  end if;
  insert into public.configuration_history(setting_key,old_value,new_value,edited_by,reason)
    values(p_key,oldv,p_value,auth.uid(),nullif(trim(coalesce(p_reason,'')),''));
  perform public.audit('configuration.update','setting:'||p_key,jsonb_build_object('old',oldv,'new',p_value));
  return jsonb_build_object('ok',true,'key',p_key,'value',p_value,'version',current_version);
end $$;

create or replace function public.fn_admin_set_station_config(
 p_station_id integer,p_difficulty text,p_token_cost integer,p_exclusion_limit integer,
 p_is_active boolean,p_expected_version bigint,p_reason text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare oldv jsonb; newver bigint;
begin
 if not public.has_permission('configuration.manage') then raise exception 'PERMISSION_DENIED'; end if;
 if upper(p_difficulty) not in ('EASY','MEDIUM','HARD') or p_token_cost<0 or p_exclusion_limit<0 then raise exception 'INVALID_STATION_CONFIGURATION'; end if;
 select to_jsonb(s),config_version into oldv,newver from public.stations s where id=p_station_id for update;
 if not found then raise exception 'STATION_NOT_FOUND'; end if;
 if newver<>p_expected_version then raise exception 'CONFIGURATION_CONFLICT'; end if;
 update public.stations set difficulty=upper(p_difficulty),token_cost=p_token_cost,
   location_exclusion_limit=p_exclusion_limit,is_active=p_is_active,
   updated_by=auth.uid(),updated_at=now(),config_version=config_version+1 where id=p_station_id;
 insert into public.configuration_history(station_id,old_value,new_value,edited_by,reason)
   select p_station_id,oldv,to_jsonb(s),auth.uid(),nullif(trim(coalesce(p_reason,'')),'') from public.stations s where id=p_station_id;
 perform public.audit('configuration.station','station:'||p_station_id,jsonb_build_object('old',oldv));
 return jsonb_build_object('ok',true,'station_id',p_station_id,'version',newver+1);
end $$;

alter table public.game_setting_definitions enable row level security;
alter table public.configuration_history enable row level security;
drop policy if exists "authenticated reads game setting definitions" on public.game_setting_definitions;
create policy "authenticated reads game setting definitions" on public.game_setting_definitions
  for select using (auth.uid() is not null);
drop policy if exists "admin reads configuration history" on public.configuration_history;
create policy "admin reads configuration history" on public.configuration_history for select using(public.has_permission('configuration.manage'));
revoke all on public.game_setting_definitions,public.configuration_history from anon;
grant select on public.game_setting_definitions,public.configuration_history to authenticated;
revoke all on function public.fn_admin_set_game_setting(text,jsonb,bigint,text) from public,anon;
revoke all on function public.fn_admin_set_station_config(integer,text,integer,integer,boolean,bigint,text) from public,anon;
grant execute on function public.fn_admin_set_game_setting(text,jsonb,bigint,text) to authenticated;
grant execute on function public.fn_admin_set_station_config(integer,text,integer,integer,boolean,bigint,text) to authenticated;
