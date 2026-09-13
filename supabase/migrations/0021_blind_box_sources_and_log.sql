-- Section 6: Blind Box sources, individual boxes and Admin correction log.
-- This coexists with the legacy blind_box_* tables until Section 7 migrates claims.

do $$ begin create type public.blind_box_source_type as enum ('OC_TEAM','HOF','HOGM','GM_STATION'); exception when duplicate_object then null; end $$;
do $$ begin create type public.blind_box_type as enum ('NORMAL','SPECIAL'); exception when duplicate_object then null; end $$;
do $$ begin create type public.blind_box_status as enum ('AVAILABLE','CLAIMED','OPENED','CANCELLED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.reward_credit_status as enum ('NOT_REQUIRED','PENDING','APPLIED','REVERSED'); exception when duplicate_object then null; end $$;

insert into public.role_permissions(role,permission)
values ('admin','blindbox.manage') on conflict do nothing;

create table if not exists public.blind_box_sources (
 id bigserial primary key,
 source_code text not null unique,
 source_type public.blind_box_source_type not null,
 source_name text not null,
 station_id integer references public.stations(id),
 stock_quantity integer not null default 0 check(stock_quantity>=0),
 claim_cost integer not null default 0 check(claim_cost>=0),
 per_group_claim_limit integer not null default 1 check(per_group_claim_limit>=0),
 is_active boolean not null default true,
 version bigint not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id),
 check ((source_type='GM_STATION')=(station_id is not null))
);

create table if not exists public.blind_boxes (
 id bigserial primary key,
 blind_box_id text unique,
 source_id bigint not null references public.blind_box_sources(id),
 type public.blind_box_type not null default 'NORMAL',
 reward_amount integer not null check(reward_amount>=0),
 owner_group_id integer references public.groups(id),
 status public.blind_box_status not null default 'AVAILABLE',
 claimed_by uuid references public.profiles(id),
 claimed_at timestamptz,
 opened_at timestamptz,
 reward_credit_status public.reward_credit_status not null default 'PENDING',
 version bigint not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id),
 check (status='AVAILABLE' or owner_group_id is not null),
 check (opened_at is null or claimed_at is not null)
);

create table if not exists public.blind_box_edit_history (
 id bigserial primary key,
 blind_box_id bigint not null references public.blind_boxes(id),
 original_value jsonb not null,
 new_value jsonb not null,
 edited_by uuid not null references public.profiles(id),
 edited_at timestamptz not null default now(),
 reason text not null check(length(trim(reason))>0)
);

create index if not exists blind_boxes_group_idx on public.blind_boxes(owner_group_id);
create index if not exists blind_boxes_source_idx on public.blind_boxes(source_id);
create index if not exists blind_boxes_filter_idx on public.blind_boxes(type,status,claimed_at,opened_at);
create index if not exists blind_boxes_reward_idx on public.blind_boxes(reward_amount);

create or replace function public.set_blind_box_id() returns trigger language plpgsql set search_path=public as $$
begin new.blind_box_id:=coalesce(new.blind_box_id,'BB'||lpad(new.id::text,6,'0')); return new; end $$;
drop trigger if exists set_blind_box_id_trigger on public.blind_boxes;
create trigger set_blind_box_id_trigger before insert on public.blind_boxes for each row execute function public.set_blind_box_id();

create or replace function public.fn_admin_update_blind_box_source(
 p_source_id bigint,p_stock integer,p_claim_cost integer,p_claim_limit integer,
 p_is_active boolean,p_expected_version bigint
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v bigint;
begin
 if not public.has_permission('configuration.manage') then raise exception 'PERMISSION_DENIED'; end if;
 if p_stock<0 or p_claim_cost<0 or p_claim_limit<0 then raise exception 'INVALID_SOURCE_CONFIGURATION'; end if;
 select version into v from public.blind_box_sources where id=p_source_id for update;
 if not found then raise exception 'INVALID_SOURCE_CONFIGURATION'; end if;
 if v<>p_expected_version then raise exception 'CONFIGURATION_CONFLICT'; end if;
 update public.blind_box_sources set stock_quantity=p_stock,claim_cost=p_claim_cost,
  per_group_claim_limit=p_claim_limit,is_active=p_is_active,updated_by=auth.uid(),updated_at=now(),version=version+1
  where id=p_source_id;
 perform public.audit('blind_box.source_update','source:'||p_source_id,jsonb_build_object('stock',p_stock,'claim_cost',p_claim_cost));
 return jsonb_build_object('ok',true,'source_id',p_source_id,'version',v+1);
end $$;

create or replace function public.fn_admin_correct_blind_box(
 p_blind_box_id text,p_type public.blind_box_type,p_status public.blind_box_status,
 p_reward_amount integer,p_owner_group_id integer,p_credit_status public.reward_credit_status,
 p_expected_version bigint,p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.blind_boxes%rowtype; afterv jsonb;
begin
 if not public.has_permission('blind_box.manage') then raise exception 'PERMISSION_DENIED'; end if;
 if p_reward_amount<0 or length(trim(coalesce(p_reason,'')))=0 then raise exception 'INVALID_BLIND_BOX_CORRECTION'; end if;
 if p_owner_group_id is not null and not exists(select 1 from public.groups where id=p_owner_group_id and is_active) then raise exception 'INVALID_GROUP'; end if;
 if p_status<>'AVAILABLE' and p_owner_group_id is null then raise exception 'OWNED_STATUS_REQUIRES_GROUP'; end if;
 select * into b from public.blind_boxes where blind_box_id=p_blind_box_id for update;
 if not found then raise exception 'INVALID_BLIND_BOX_ID'; end if;
 if b.version<>p_expected_version then raise exception 'BLIND_BOX_CONFLICT'; end if;
 update public.blind_boxes set type=p_type,status=p_status,reward_amount=p_reward_amount,
  owner_group_id=p_owner_group_id,reward_credit_status=p_credit_status,
  claimed_at=case when p_status='AVAILABLE' then null else coalesce(claimed_at,now()) end,
  opened_at=case when p_status='OPENED' then coalesce(opened_at,now()) else null end,
  updated_by=auth.uid(),updated_at=now(),version=version+1 where id=b.id;
 select to_jsonb(bb) into afterv from public.blind_boxes bb where id=b.id;
 insert into public.blind_box_edit_history(blind_box_id,original_value,new_value,edited_by,reason)
  values(b.id,to_jsonb(b),afterv,auth.uid(),trim(p_reason));
 perform public.audit('blind_box.correct','blind_box:'||p_blind_box_id,jsonb_build_object('reason',trim(p_reason)));
 return jsonb_build_object('ok',true,'blind_box_id',p_blind_box_id,'version',b.version+1);
end $$;

alter table public.blind_box_sources enable row level security;
alter table public.blind_boxes enable row level security;
alter table public.blind_box_edit_history enable row level security;
create policy "admin manages blind box sources" on public.blind_box_sources for all using(public.has_permission('blind_box.manage')) with check(public.has_permission('blind_box.manage'));
create policy "admin manages blind boxes" on public.blind_boxes for all using(public.has_permission('blind_box.manage')) with check(public.has_permission('blind_box.manage'));
create policy "admin reads blind box history" on public.blind_box_edit_history for select using(public.has_permission('blind_box.manage'));
revoke all on public.blind_box_sources,public.blind_boxes,public.blind_box_edit_history from anon;
grant select,insert,update,delete on public.blind_box_sources,public.blind_boxes to authenticated;
grant select on public.blind_box_edit_history to authenticated;
revoke all on function public.fn_admin_update_blind_box_source(bigint,integer,integer,integer,boolean,bigint) from public,anon;
revoke all on function public.fn_admin_correct_blind_box(text,public.blind_box_type,public.blind_box_status,integer,integer,public.reward_credit_status,bigint,text) from public,anon;
grant execute on function public.fn_admin_update_blind_box_source(bigint,integer,integer,integer,boolean,bigint) to authenticated;
grant execute on function public.fn_admin_correct_blind_box(text,public.blind_box_type,public.blind_box_status,integer,integer,public.reward_credit_status,bigint,text) to authenticated;

-- Seed the 24 planned sources. HOF and HOGM are source categories, not account roles.
do $$ declare i integer; sid integer; stock integer; cost integer; lim integer;
begin
 select (value#>>'{}')::integer into cost from public.game_config where key='blind_box_gm_claim_cost';
 select (value#>>'{}')::integer into lim from public.game_config where key='blind_box_source_claim_limit';
 for i in 1..4 loop
  select (value#>>'{}')::integer into stock from public.game_config where key='blind_box_oc_team_default_stock';
  insert into public.blind_box_sources(source_code,source_type,source_name,stock_quantity,claim_cost,per_group_claim_limit)
   values('OC'||lpad(i::text,2,'0'),'OC_TEAM','OC Team '||i,stock,0,lim) on conflict(source_code) do nothing;
  select (value#>>'{}')::integer into stock from public.game_config where key='blind_box_hof_default_stock';
  insert into public.blind_box_sources(source_code,source_type,source_name,stock_quantity,claim_cost,per_group_claim_limit)
   values('HOF'||lpad(i::text,2,'0'),'HOF','HOF '||i,stock,0,lim) on conflict(source_code) do nothing;
  select (value#>>'{}')::integer into stock from public.game_config where key='blind_box_hogm_default_stock';
  insert into public.blind_box_sources(source_code,source_type,source_name,stock_quantity,claim_cost,per_group_claim_limit)
   values('HOGM'||lpad(i::text,2,'0'),'HOGM','HOGM '||i,stock,0,lim) on conflict(source_code) do nothing;
 end loop;
 for i in 1..12 loop
  select id into sid from public.stations order by id offset (i-1) limit 1;
  if sid is null then
    insert into public.stations(code,name,area,status) values('GM-'||lpad(i::text,2,'0'),'GM Station '||i,'TBC','closed') returning id into sid;
  end if;
  select (value#>>'{}')::integer into stock from public.game_config where key='blind_box_gm_station_default_stock';
  insert into public.blind_box_sources(source_code,source_type,source_name,station_id,stock_quantity,claim_cost,per_group_claim_limit)
   values('GM'||lpad(i::text,2,'0'),'GM_STATION','GM Station '||i,sid,stock,cost,lim) on conflict(source_code) do nothing;
 end loop;
end $$;

-- Create initial stock only when a source has no individual boxes yet.
do $$ declare s record; i integer; bt public.blind_box_type; mn integer; mx integer;
begin
 for s in select * from public.blind_box_sources loop
  if not exists(select 1 from public.blind_boxes where source_id=s.id) then
   for i in 1..s.stock_quantity loop
    bt:=case when s.source_type='OC_TEAM' and i=s.stock_quantity then 'SPECIAL'::public.blind_box_type else 'NORMAL'::public.blind_box_type end;
    if bt='SPECIAL' then
     select (value#>>'{}')::integer into mn from public.game_config where key='blind_box_special_reward_min';
     select (value#>>'{}')::integer into mx from public.game_config where key='blind_box_special_reward_max';
    else
     select (value#>>'{}')::integer into mn from public.game_config where key='blind_box_normal_reward_min';
     select (value#>>'{}')::integer into mx from public.game_config where key='blind_box_normal_reward_max';
    end if;
    insert into public.blind_boxes(source_id,type,reward_amount) values(s.id,bt,floor(random()*(mx-mn+1)+mn)::integer);
   end loop;
  end if;
 end loop;
end $$;

do $$ begin alter publication supabase_realtime add table public.blind_box_sources; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.blind_boxes; exception when duplicate_object then null; end $$;
