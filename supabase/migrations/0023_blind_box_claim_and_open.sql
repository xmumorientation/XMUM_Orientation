-- Sections 7-8: secure source claims, group inventory and one-time opening.
-- Current orientation only. Freshie Auth is supported when an authenticated
-- Freshie identity is supplied by the roster team's future identity bridge.

-- Correct the permission spelling used by the Section 6 Admin functions.
insert into public.role_permissions(role,permission)
values ('admin','blind_box.manage') on conflict do nothing;

-- These permissions are dormant for roster-only Freshies, but allow the
-- teammate module to attach a secure authenticated Freshie bridge later.
insert into public.role_permissions(role,permission) values
 ('freshie','dashboard.view'),('freshie','inventory.view'),
 ('freshie','map.view'),('freshie','lighting.view'),('freshie','timer.view'),
 ('freshie','group.resources.view'),('freshie','blindbox.claim'),
 ('freshie','blindbox.open'),('freshie','nfc.scan'),('freshie','token.view')
on conflict do nothing;

alter table public.blind_box_sources add column if not exists qr_token_hash text unique;
alter table public.blind_box_sources add column if not exists qr_rotated_at timestamptz;
alter table public.blind_boxes add column if not exists opened_by uuid references public.profiles(id);
alter table public.blind_boxes add column if not exists open_request_id text unique;

create table if not exists public.blind_box_claim_records (
 id bigserial primary key,
 group_id integer not null references public.groups(id),
 source_id bigint not null references public.blind_box_sources(id),
 blind_box_id bigint not null unique references public.blind_boxes(id),
 claim_cost integer not null check(claim_cost>=0),
 token_charge_status public.reward_credit_status not null default 'PENDING',
 claimed_by uuid not null references public.profiles(id),
 claimed_at timestamptz not null default now(),
 request_id text not null unique,
 unique(group_id,source_id)
);

create table if not exists public.group_notifications (
 id bigserial primary key,
 group_id integer not null references public.groups(id) on delete cascade,
 notification_type text not null,
 message text not null,
 reference_id text,
 created_at timestamptz not null default now()
);
create index if not exists group_notifications_target_idx on public.group_notifications(group_id,created_at desc);

alter table public.token_logs drop constraint if exists token_logs_transaction_type_check;
alter table public.token_logs add constraint token_logs_transaction_type_check check(
 transaction_type in ('DAY1_GAME','DAY2_ENTRY','MANUAL_GM_ADJUST','MANUAL_ADMIN_ADJUST','SYSTEM_RESET','BLIND_BOX_CLAIM','BLIND_BOX_REWARD')
);
alter table public.token_logs add column if not exists reference_id text unique;

create or replace function public.current_gameplay_group_id()
returns integer language sql stable security definer set search_path=public as $$
 select coalesce(
  (select a.group_id from public.user_group_assignments a where a.user_id=auth.uid()),
  (select p.group_id from public.profiles p where p.id=auth.uid())
 );
$$;

create or replace function public.fn_claim_blind_box_source(p_qr_hash text,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_role public.user_role; gid integer; src public.blind_box_sources%rowtype;
 box public.blind_boxes%rowtype; existing public.blind_box_claim_records%rowtype;
 gm_count integer; gm_limit integer; bal integer; v_cost integer; v_min integer; v_max integer; v_reward integer;
begin
 select role into v_role from public.profiles where id=auth.uid();
 if auth.uid() is null or v_role not in ('faci','freshie') then raise exception 'PERMISSION_DENIED'; end if;
 gid:=public.current_gameplay_group_id(); if gid is null then raise exception 'GROUP_NOT_ASSIGNED'; end if;
 if p_request_id is null or length(p_request_id)<8 then raise exception 'INVALID_REQUEST_ID'; end if;
 select * into existing from public.blind_box_claim_records where request_id=p_request_id;
 if found then return jsonb_build_object('ok',true,'duplicate',true,'blind_box_id',(select blind_box_id from public.blind_boxes where id=existing.blind_box_id),'type',(select type from public.blind_boxes where id=existing.blind_box_id)); end if;
 if public.config_bool('blindbox_disabled',false) then raise exception 'BLIND_BOX_DISABLED'; end if;
 if not (public.phase_active('day1') or public.phase_active('day2')) then raise exception 'BLIND_BOX_SESSION_CLOSED'; end if;
 select * into src from public.blind_box_sources where qr_token_hash=p_qr_hash for update;
 if not found then raise exception 'INVALID_BLIND_BOX_SOURCE_QR'; end if;
 if not src.is_active then raise exception 'BLIND_BOX_SOURCE_INACTIVE'; end if;
 if exists(select 1 from public.blind_box_claim_records where group_id=gid and source_id=src.id) then raise exception 'SOURCE_ALREADY_CLAIMED'; end if;
 if src.source_type='GM_STATION' then
  select count(*) into gm_count from public.blind_box_claim_records c join public.blind_box_sources s on s.id=c.source_id where c.group_id=gid and s.source_type='GM_STATION';
  select coalesce((value#>>'{}')::integer,0) into gm_limit from public.game_config where key='blind_box_gm_total_claim_limit';
  if gm_limit>0 and gm_count>=gm_limit then raise exception 'GM_BLIND_BOX_LIMIT_REACHED'; end if;
 end if;
 v_cost:=src.claim_cost;
 if src.source_type='GM_STATION' then
  select coalesce((value#>>'{}')::integer,src.claim_cost) into v_cost from public.game_config where key='blind_box_gm_claim_cost';
 end if;
 if (select count(*) from public.blind_box_claim_records where group_id=gid and source_id=src.id)>=src.per_group_claim_limit then raise exception 'SOURCE_ALREADY_CLAIMED'; end if;
 if src.stock_quantity<=0 then raise exception 'BLIND_BOX_OUT_OF_STOCK'; end if;
 select * into box from public.blind_boxes where source_id=src.id and status='AVAILABLE' order by id for update skip locked limit 1;
 if not found then raise exception 'BLIND_BOX_OUT_OF_STOCK'; end if;
 if box.type='SPECIAL' then
  select (value#>>'{}')::integer into v_min from public.game_config where key='blind_box_special_reward_min';
  select (value#>>'{}')::integer into v_max from public.game_config where key='blind_box_special_reward_max';
 else
  select (value#>>'{}')::integer into v_min from public.game_config where key='blind_box_normal_reward_min';
  select (value#>>'{}')::integer into v_max from public.game_config where key='blind_box_normal_reward_max';
 end if;
 v_reward:=floor(random()*(v_max-v_min+1)+v_min)::integer;
 if v_cost>0 then
  update public.groups set current_tokens=current_tokens-v_cost,token_balance=token_balance-v_cost
   where id=gid and current_tokens>=v_cost and token_balance>=v_cost returning current_tokens into bal;
  if not found then raise exception 'INSUFFICIENT_BALANCE'; end if;
 end if;
 update public.blind_boxes set owner_group_id=gid,status='CLAIMED',reward_amount=v_reward,claimed_by=auth.uid(),claimed_at=now(),updated_at=now(),version=version+1 where id=box.id;
 update public.blind_box_sources set stock_quantity=stock_quantity-1,updated_at=now(),version=version+1 where id=src.id;
 insert into public.blind_box_claim_records(group_id,source_id,blind_box_id,claim_cost,token_charge_status,claimed_by,request_id)
 values(gid,src.id,box.id,v_cost,case when v_cost>0 then 'APPLIED' else 'NOT_REQUIRED' end,auth.uid(),p_request_id)
 returning * into existing;
 if v_cost>0 then
  insert into public.token_logs(group_id,amount,transaction_type,station_id,notes,reference_id)
   values(gid,-v_cost,'BLIND_BOX_CLAIM',src.station_id,'Blind Box claim at '||src.source_name,'blindbox-claim:'||existing.id);
  insert into public.token_transactions(group_id,delta,reason,actor,station_id,idempotency_key)
   values(gid,-v_cost,'Blind Box claim at '||src.source_name,auth.uid(),src.station_id,'blindbox-claim:'||existing.id);
 end if;
 insert into public.group_notifications(group_id,notification_type,message,reference_id) values(gid,'BLIND_BOX_CLAIMED','Blind Box obtained successfully.',box.blind_box_id);
 perform public.audit('blind_box.claim','blind_box:'||box.blind_box_id,jsonb_build_object('group_id',gid,'source_id',src.id,'cost',v_cost));
 return jsonb_build_object('ok',true,'duplicate',false,'blind_box_id',box.blind_box_id,'type',box.type);
exception when unique_violation then
 if exists(select 1 from public.blind_box_claim_records where request_id=p_request_id) then return jsonb_build_object('ok',true,'duplicate',true); end if;
 raise exception 'SOURCE_ALREADY_CLAIMED';
end $$;

create or replace function public.fn_group_blind_boxes()
returns table(blind_box_id text,type public.blind_box_type,status public.blind_box_status,claimed_at timestamptz,opened_at timestamptz,reward_amount integer,reward_credit_status public.reward_credit_status)
language sql stable security definer set search_path=public as $$
 select b.blind_box_id,b.type,b.status,b.claimed_at,b.opened_at,
  case when b.status='OPENED' then b.reward_amount else null end,
  b.reward_credit_status
 from public.blind_boxes b where b.owner_group_id=public.current_gameplay_group_id() and public.my_role() in ('faci','freshie') order by b.claimed_at desc;
$$;

create or replace function public.fn_open_blind_box(p_blind_box_id text,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_role public.user_role; gid integer; box public.blind_boxes%rowtype; bal integer;
begin
 select role into v_role from public.profiles where id=auth.uid();
 if auth.uid() is null or v_role not in ('faci','freshie') then raise exception 'PERMISSION_DENIED'; end if;
 gid:=public.current_gameplay_group_id(); if gid is null then raise exception 'GROUP_NOT_ASSIGNED'; end if;
 select * into box from public.blind_boxes where blind_box_id=p_blind_box_id for update;
 if not found or box.owner_group_id is distinct from gid then raise exception 'BLIND_BOX_NOT_FOUND'; end if;
 if box.status='OPENED' and box.open_request_id=p_request_id then return jsonb_build_object('ok',true,'duplicate',true,'reward_amount',box.reward_amount,'credit_status',box.reward_credit_status); end if;
 if box.status<>'CLAIMED' then raise exception 'BLIND_BOX_ALREADY_OPENED'; end if;
 if not (public.phase_active('day1') or public.phase_active('day2') or public.config_bool('allow_blind_box_open_after_session',false)) then raise exception 'BLIND_BOX_OPENING_CLOSED'; end if;
 update public.groups set current_tokens=current_tokens+box.reward_amount,token_balance=token_balance+box.reward_amount where id=gid returning current_tokens into bal;
 insert into public.token_logs(group_id,amount,transaction_type,notes,reference_id) values(gid,box.reward_amount,'BLIND_BOX_REWARD','Reward from '||box.blind_box_id,'blindbox-reward:'||box.id);
 insert into public.token_transactions(group_id,delta,reason,actor,idempotency_key) values(gid,box.reward_amount,'Reward from '||box.blind_box_id,auth.uid(),'blindbox-reward:'||box.id);
 update public.blind_boxes set status='OPENED',opened_at=now(),opened_by=auth.uid(),open_request_id=p_request_id,reward_credit_status='APPLIED',updated_at=now(),version=version+1 where id=box.id;
 insert into public.group_notifications(group_id,notification_type,message,reference_id) values(gid,'BLIND_BOX_OPENED','Your group received '||box.reward_amount||' tokens.',box.blind_box_id);
 perform public.audit('blind_box.open','blind_box:'||box.blind_box_id,jsonb_build_object('group_id',gid,'reward',box.reward_amount));
 return jsonb_build_object('ok',true,'duplicate',false,'reward_amount',box.reward_amount,'credit_status','APPLIED','balance',bal);
exception when unique_violation then raise exception 'BLIND_BOX_ALREADY_OPENED';
end $$;

alter table public.blind_box_claim_records enable row level security;
alter table public.group_notifications enable row level security;
create policy "admin reads blind box claims" on public.blind_box_claim_records for select using(public.has_permission('logs.blindbox'));
create policy "group reads own notifications" on public.group_notifications for select using(group_id=public.current_gameplay_group_id());
create policy "admin reads group notifications" on public.group_notifications for select using(public.has_permission('logs.audit'));
revoke all on public.blind_box_claim_records,public.group_notifications from anon;
grant select on public.blind_box_claim_records,public.group_notifications to authenticated;
revoke all on function public.fn_claim_blind_box_source(text,text),public.fn_group_blind_boxes(),public.fn_open_blind_box(text,text) from public,anon;
grant execute on function public.fn_claim_blind_box_source(text,text),public.fn_group_blind_boxes(),public.fn_open_blind_box(text,text) to authenticated;
do $$ begin alter publication supabase_realtime add table public.group_notifications; exception when duplicate_object then null; end $$;
