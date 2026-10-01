-- SECTION 15: single-use NFC Puzzle redemption and Lighting Zone activation.
-- Current-orientation schema: projectors are the three Lighting Zones.

alter table public.nfc_tokens
  add column if not exists status text not null default 'AVAILABLE'
    check(status in ('AVAILABLE','USED','DISABLED')),
  add column if not exists used_by_user uuid references public.profiles(id),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists version bigint not null default 1;
update public.nfc_tokens set status=case when used_at is null then 'AVAILABLE' else 'USED' end;

create table if not exists public.nfc_puzzle_requirements(
  requirement_id bigserial primary key,
  nfc_id integer references public.nfc_tokens(id) on delete cascade,
  zone_location public.projector_location not null,
  puzzle_id integer not null references public.items(id),
  created_at timestamptz not null default now(),
  unique(nfc_id,puzzle_id)
);

create table if not exists public.nfc_guardian_verifications(
  verification_id bigserial primary key,
  group_id integer not null references public.groups(id),
  zone_location public.projector_location not null,
  verified_by uuid not null references public.profiles(id),
  card_note text not null default '',
  verified_at timestamptz not null default now(),
  consumed_by_nfc_id integer references public.nfc_tokens(id),
  consumed_at timestamptz,
  unique(group_id,zone_location)
);

create table if not exists public.nfc_logs(
  log_id bigserial primary key,
  nfc_id integer references public.nfc_tokens(id),
  zone_location public.projector_location,
  group_id integer references public.groups(id),
  user_id uuid references public.profiles(id),
  action text not null,
  status text not null,
  request_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists nfc_logs_success_request_unique
  on public.nfc_logs(request_id) where status='SUCCESS' and request_id is not null;
create index if not exists nfc_logs_filter_idx on public.nfc_logs(nfc_id,zone_location,group_id,created_at desc);

-- Existing cards default to all active Puzzle pieces for their mapped Zone.
insert into public.nfc_puzzle_requirements(nfc_id,zone_location,puzzle_id)
select n.id,n.location,i.id from public.nfc_tokens n join public.items i
  on i.type='puzzle' and i.puzzle_location=n.location and i.is_active
on conflict do nothing;

create or replace function public.fn_verify_nfc_handover(
  p_group_id integer,p_location public.projector_location,p_card_note text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_required integer; v_collected integer;
begin
  if not public.has_permission('gameplay.puzzle_verify') then raise exception 'PERMISSION_DENIED'; end if;
  select count(*) into v_required from public.items where type='puzzle' and puzzle_location=p_location and is_active;
  select count(*) into v_collected from public.inventory inv join public.items i on i.id=inv.item_id
    where inv.group_id=p_group_id and inv.status='COLLECTED' and i.type='puzzle'
      and i.puzzle_location=p_location and i.is_active;
  if v_required=0 or v_collected<v_required then raise exception 'SET_INCOMPLETE'; end if;
  if exists(select 1 from public.projectors where location=p_location and activated_at is not null) then
    raise exception 'PROJECTOR_ALREADY_ACTIVATED';
  end if;
  insert into public.nfc_guardian_verifications(group_id,zone_location,verified_by,card_note)
    values(p_group_id,p_location,auth.uid(),coalesce(p_card_note,''))
  on conflict(group_id,zone_location) do update set verified_by=excluded.verified_by,
    card_note=excluded.card_note,verified_at=now(),consumed_by_nfc_id=null,consumed_at=null;
  perform public.audit('nfc.handover.verify','group:'||p_group_id,
    jsonb_build_object('location',p_location,'card_note',p_card_note));
  return jsonb_build_object('ok',true,'required',v_required,'collected',v_collected);
end $$;

-- Keep the legacy Guardian RPC name compatible, but no longer redeem early.
create or replace function public.fn_redeem_puzzle_set(
  p_group_id integer,p_location public.projector_location,p_nfc_note text
) returns jsonb language sql security definer set search_path=public as $$
  select public.fn_verify_nfc_handover(p_group_id,p_location,p_nfc_note)
$$;

create or replace function public.fn_lighting_zones()
returns table(location public.projector_location,name text,activated_by_group integer,activated_group_name text,activated_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_permission('lighting.view') then raise exception 'PERMISSION_DENIED'; end if;
  return query select p.location,p.name,p.activated_by_group,g.name,p.activated_at
    from public.projectors p left join public.groups g on g.id=p.activated_by_group order by p.location;
end $$;

create or replace function public.fn_redeem_nfc_card(p_token_hash text,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_group integer; v_card public.nfc_tokens%rowtype; v_zone public.projectors%rowtype;
  v_required integer; v_collected integer; v_log public.nfc_logs%rowtype;
begin
  if auth.uid() is null or public.my_role() not in ('faci','freshie') or not public.has_permission('nfc.scan') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_request_id is null or length(trim(p_request_id))<8 then raise exception 'INVALID_REQUEST_ID'; end if;
  select * into v_log from public.nfc_logs where request_id=p_request_id and status='SUCCESS';
  if found then return jsonb_build_object('ok',true,'duplicate',true,'location',v_log.zone_location,'group_id',v_log.group_id); end if;
  v_group:=public.current_gameplay_group_id(); if v_group is null then raise exception 'GROUP_NOT_ASSIGNED'; end if;
  if public.config_bool('nfc_disabled',false) then raise exception 'NFC_DISABLED'; end if;
  if not public.phase_active('endgame') then raise exception 'NOT_ENDGAME'; end if;
  select * into v_card from public.nfc_tokens where token_hash=p_token_hash for update;
  if not found then raise exception 'TOKEN_UNKNOWN'; end if;
  if v_card.status='DISABLED' then raise exception 'NFC_DISABLED'; end if;
  if v_card.status='USED' or v_card.used_at is not null then raise exception 'TOKEN_USED'; end if;
  select * into v_zone from public.projectors where location=v_card.location for update;
  if not found then raise exception 'NFC_WRONG_EVENT'; end if;
  if v_zone.activated_at is not null then raise exception 'ALREADY_ACTIVATED'; end if;
  if exists(select 1 from public.projectors where activated_by_group=v_group) then raise exception 'GROUP_ALREADY_ACTIVATED_ONE'; end if;
  if not exists(select 1 from public.nfc_guardian_verifications where group_id=v_group
    and zone_location=v_card.location and consumed_at is null) then raise exception 'NFC_HANDOVER_NOT_VERIFIED'; end if;

  select count(*) into v_required from public.nfc_puzzle_requirements where nfc_id=v_card.id;
  if v_required=0 then
    select count(*) into v_required from public.items where type='puzzle' and puzzle_location=v_card.location and is_active;
    select count(*) into v_collected from public.inventory inv join public.items i on i.id=inv.item_id
      where inv.group_id=v_group and inv.status='COLLECTED' and i.type='puzzle'
        and i.puzzle_location=v_card.location and i.is_active;
  else
    select count(*) into v_collected from public.nfc_puzzle_requirements r join public.inventory inv on inv.item_id=r.puzzle_id
      where r.nfc_id=v_card.id and inv.group_id=v_group and inv.status='COLLECTED';
  end if;
  if v_required=0 or v_collected<>v_required then raise exception 'NFC_PUZZLES_INCOMPLETE'; end if;

  if exists(select 1 from public.nfc_puzzle_requirements where nfc_id=v_card.id) then
    update public.inventory inv set status='REDEEMED',redeemed_at=now(),redeemed_by_nfc_id=v_card.id::text,version=version+1
      where inv.group_id=v_group and inv.status='COLLECTED'
        and inv.item_id in(select puzzle_id from public.nfc_puzzle_requirements where nfc_id=v_card.id);
  else
    update public.inventory inv set status='REDEEMED',redeemed_at=now(),redeemed_by_nfc_id=v_card.id::text,version=version+1
      from public.items i where inv.item_id=i.id and inv.group_id=v_group and inv.status='COLLECTED'
        and i.type='puzzle' and i.puzzle_location=v_card.location and i.is_active;
  end if;
  insert into public.puzzle_redemptions(group_id,location,redeemed_by,nfc_note)
    values(v_group,v_card.location,auth.uid(),v_card.label) on conflict(group_id,location) do nothing;
  update public.projectors set activated_by_group=v_group,activated_at=now(),activated_manually=false where location=v_card.location;
  update public.nfc_tokens set status='USED',used_at=now(),used_by_group=v_group,used_by_user=auth.uid(),updated_at=now(),version=version+1 where id=v_card.id;
  update public.nfc_guardian_verifications set consumed_by_nfc_id=v_card.id,consumed_at=now()
    where group_id=v_group and zone_location=v_card.location;
  insert into public.nfc_logs(nfc_id,zone_location,group_id,user_id,action,status,request_id,detail)
    values(v_card.id,v_card.location,v_group,auth.uid(),'REDEEM','SUCCESS',p_request_id,jsonb_build_object('puzzles_redeemed',v_required));
  insert into public.group_notifications(group_id,notification_type,message,reference_id)
    values(v_group,'ZONE_ACTIVATED','Zone '||v_card.location||' activated successfully.',v_card.id::text);
  perform public.audit('nfc.redeem','nfc:'||v_card.id,jsonb_build_object('group_id',v_group,'location',v_card.location,'puzzles',v_required));
  return jsonb_build_object('ok',true,'duplicate',false,'location',v_card.location,'group_id',v_group,'puzzles_redeemed',v_required);
exception when unique_violation then raise exception 'NFC_DUPLICATE_REDEMPTION';
end $$;

create or replace function public.fn_admin_set_nfc_card(
  p_nfc_id integer,p_location public.projector_location,p_label text,p_status text,p_expected_version bigint,p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_card public.nfc_tokens%rowtype;
begin
  if not public.has_permission('nfc.recovery') then raise exception 'PERMISSION_DENIED'; end if;
  if p_status not in ('AVAILABLE','USED','DISABLED') or nullif(trim(p_reason),'') is null then raise exception 'INVALID_NFC_CONFIGURATION'; end if;
  select * into v_card from public.nfc_tokens where id=p_nfc_id for update;
  if not found then raise exception 'TOKEN_UNKNOWN'; end if;
  if v_card.version<>p_expected_version then raise exception 'CONFIGURATION_CONFLICT'; end if;
  if p_status='USED' and v_card.used_at is null then raise exception 'INVALID_NFC_CONFIGURATION'; end if;
  if p_status='AVAILABLE' and v_card.used_at is not null then raise exception 'NFC_USE_RESET_ACTION'; end if;
  if v_card.used_at is not null and p_location<>v_card.location then raise exception 'NFC_REVERT_BEFORE_REMAP'; end if;
  update public.nfc_tokens set location=p_location,label=coalesce(trim(p_label),''),status=p_status,updated_at=now(),version=version+1 where id=p_nfc_id;
  update public.nfc_puzzle_requirements set zone_location=p_location where nfc_id=p_nfc_id;
  insert into public.nfc_logs(nfc_id,zone_location,group_id,user_id,action,status,detail)
    values(p_nfc_id,p_location,v_card.used_by_group,auth.uid(),'EDIT','SUCCESS',jsonb_build_object('reason',p_reason,'old_status',v_card.status,'new_status',p_status));
  perform public.audit('nfc.edit','nfc:'||p_nfc_id,jsonb_build_object('reason',p_reason,'location',p_location,'status',p_status));
  return jsonb_build_object('ok',true,'version',v_card.version+1);
end $$;

create or replace function public.fn_admin_set_nfc_requirements(p_nfc_id integer,p_puzzle_ids integer[],p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_location public.projector_location;
begin
  if not public.has_permission('nfc.recovery') then raise exception 'PERMISSION_DENIED'; end if;
  if nullif(trim(p_reason),'') is null or coalesce(cardinality(p_puzzle_ids),0)=0 then raise exception 'INVALID_NFC_CONFIGURATION'; end if;
  select location into v_location from public.nfc_tokens where id=p_nfc_id for update;
  if not found then raise exception 'TOKEN_UNKNOWN'; end if;
  if exists(select 1 from public.nfc_tokens where id=p_nfc_id and used_at is not null) then raise exception 'NFC_REVERT_BEFORE_REMAP'; end if;
  if exists(select 1 from unnest(p_puzzle_ids) x left join public.items i on i.id=x
    where i.id is null or i.type<>'puzzle') then raise exception 'PUZZLE_NOT_FOUND'; end if;
  delete from public.nfc_puzzle_requirements where nfc_id=p_nfc_id;
  insert into public.nfc_puzzle_requirements(nfc_id,zone_location,puzzle_id)
    select p_nfc_id,v_location,x from(select distinct unnest(p_puzzle_ids) x) q;
  insert into public.nfc_logs(nfc_id,zone_location,user_id,action,status,detail)
    values(p_nfc_id,v_location,auth.uid(),'REQUIREMENTS_EDIT','SUCCESS',jsonb_build_object('reason',p_reason,'puzzle_ids',p_puzzle_ids));
  return jsonb_build_object('ok',true,'count',cardinality(p_puzzle_ids));
end $$;

create or replace function public.fn_admin_reset_nfc(p_nfc_id integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.nfc_tokens%rowtype;
begin
  if not public.has_permission('nfc.recovery') then raise exception 'PERMISSION_DENIED'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'CORRECTION_REASON_REQUIRED'; end if;
  select * into v from public.nfc_tokens where id=p_nfc_id for update;if not found then raise exception 'TOKEN_UNKNOWN';end if;
  update public.nfc_tokens set status='AVAILABLE',used_at=null,used_by_group=null,used_by_user=null,updated_at=now(),version=version+1 where id=p_nfc_id;
  insert into public.nfc_logs(nfc_id,zone_location,group_id,user_id,action,status,detail)
    values(v.id,v.location,v.used_by_group,auth.uid(),'RESET','SUCCESS',jsonb_build_object('reason',p_reason));
  perform public.audit('nfc.reset','nfc:'||v.id,jsonb_build_object('reason',p_reason,'previous_group',v.used_by_group));
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.fn_admin_revert_nfc_activation(p_nfc_id integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.nfc_tokens%rowtype;
begin
  if not public.has_permission('nfc.recovery') then raise exception 'PERMISSION_DENIED'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'CORRECTION_REASON_REQUIRED'; end if;
  select * into v from public.nfc_tokens where id=p_nfc_id for update;if not found then raise exception 'TOKEN_UNKNOWN';end if;
  if v.used_by_group is null then raise exception 'NFC_NOT_USED'; end if;
  update public.projectors set activated_by_group=null,activated_at=null,activated_manually=false
    where location=v.location and activated_by_group=v.used_by_group;
  update public.inventory set status='COLLECTED',redeemed_at=null,redeemed_by_nfc_id=null,version=version+1
    where group_id=v.used_by_group and redeemed_by_nfc_id=v.id::text;
  delete from public.puzzle_redemptions where group_id=v.used_by_group and location=v.location;
  update public.nfc_guardian_verifications set consumed_by_nfc_id=null,consumed_at=null
    where group_id=v.used_by_group and zone_location=v.location and consumed_by_nfc_id=v.id;
  update public.nfc_tokens set status='AVAILABLE',used_at=null,used_by_group=null,used_by_user=null,updated_at=now(),version=version+1 where id=v.id;
  insert into public.nfc_logs(nfc_id,zone_location,group_id,user_id,action,status,detail)
    values(v.id,v.location,v.used_by_group,auth.uid(),'REVERT_ACTIVATION','SUCCESS',jsonb_build_object('reason',p_reason));
  perform public.audit('nfc.activation.revert','nfc:'||v.id,jsonb_build_object('reason',p_reason,'group_id',v.used_by_group,'location',v.location));
  return jsonb_build_object('ok',true);
end $$;

alter table public.nfc_puzzle_requirements enable row level security;
alter table public.nfc_guardian_verifications enable row level security;
alter table public.nfc_logs enable row level security;
drop policy if exists "admin reads NFC requirements" on public.nfc_puzzle_requirements;
create policy "admin reads NFC requirements" on public.nfc_puzzle_requirements for select using(public.has_permission('logs.nfc'));
drop policy if exists "staff reads NFC verifications" on public.nfc_guardian_verifications;
create policy "staff reads NFC verifications" on public.nfc_guardian_verifications for select using(public.has_permission('gameplay.puzzle_verify') or public.has_permission('logs.nfc'));
drop policy if exists "admin reads NFC logs" on public.nfc_logs;
create policy "admin reads NFC logs" on public.nfc_logs for select using(public.has_permission('logs.nfc'));
grant select on public.nfc_puzzle_requirements,public.nfc_guardian_verifications,public.nfc_logs to authenticated;
revoke all on function public.fn_verify_nfc_handover(integer,public.projector_location,text),public.fn_lighting_zones(),
  public.fn_redeem_nfc_card(text,text),public.fn_admin_set_nfc_card(integer,public.projector_location,text,text,bigint,text),
  public.fn_admin_set_nfc_requirements(integer,integer[],text),public.fn_admin_reset_nfc(integer,text),
  public.fn_admin_revert_nfc_activation(integer,text) from public,anon;
grant execute on function public.fn_verify_nfc_handover(integer,public.projector_location,text),public.fn_lighting_zones(),
  public.fn_redeem_nfc_card(text,text),public.fn_admin_set_nfc_card(integer,public.projector_location,text,text,bigint,text),
  public.fn_admin_set_nfc_requirements(integer,integer[],text),public.fn_admin_reset_nfc(integer,text),
  public.fn_admin_revert_nfc_activation(integer,text) to authenticated;
do $$ begin alter publication supabase_realtime add table public.nfc_logs; exception when duplicate_object then null; end $$;
