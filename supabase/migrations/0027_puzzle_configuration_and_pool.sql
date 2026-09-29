-- SECTION 12: canonical Puzzle definitions and permanent group ownership.
-- items/inventory stay authoritative; puzzle_inventory remains a compatibility
-- projection for the teammate Token scoreboard.

alter table public.items
  add column if not exists puzzle_code text,
  add column if not exists is_active boolean not null default true,
  add column if not exists display_asset text,
  add column if not exists version bigint not null default 1;
update public.items set puzzle_code=puzzle_location::text||'-'||lpad(puzzle_index::text,2,'0')
where type='puzzle' and puzzle_code is null;
create unique index if not exists items_puzzle_code_unique on public.items(puzzle_code) where type='puzzle';

alter table public.inventory
  add column if not exists status text not null default 'COLLECTED' check(status in ('COLLECTED','REDEEMED')),
  add column if not exists obtained_station_id integer references public.stations(id),
  add column if not exists obtained_attempt_id uuid references public.game_attempts(attempt_id),
  add column if not exists redeemed_at timestamptz,
  add column if not exists redeemed_by_nfc_id text,
  add column if not exists version bigint not null default 1;

-- Preserve the existing Guardian redemption history in the new row status.
update public.inventory inv set status='REDEEMED',
  redeemed_at=coalesce(inv.redeemed_at,r.redeemed_at),
  redeemed_by_nfc_id=coalesce(inv.redeemed_by_nfc_id,nullif(r.nfc_note,''))
from public.items i, public.puzzle_redemptions r
where inv.item_id=i.id and inv.group_id=r.group_id and i.type='puzzle'
  and i.puzzle_location=r.location;

alter table public.puzzle_inventory
  add column if not exists canonical_item_id integer references public.items(id),
  add column if not exists source_inventory_id bigint unique references public.inventory(id) on delete set null,
  add column if not exists attempt_id uuid references public.game_attempts(attempt_id);

create table if not exists public.puzzle_ownership_corrections(
  correction_id bigserial primary key,
  inventory_id bigint not null references public.inventory(id),
  old_group_id integer not null references public.groups(id),
  new_group_id integer not null references public.groups(id),
  old_item_id integer not null references public.items(id),
  new_item_id integer not null references public.items(id),
  old_status text not null,
  new_status text not null,
  dependency_warning boolean not null default false,
  reason text not null,
  edited_by uuid not null references public.profiles(id),
  edited_at timestamptz not null default now()
);

-- Map legacy teammate rows when their trailing piece number is recognisable.
update public.puzzle_inventory pi set canonical_item_id=i.id
from public.items i
where pi.canonical_item_id is null and i.type='puzzle'
  and i.puzzle_location=(case pi.location_id when 1 then 'B1' when 2 then 'A3' when 3 then 'TF' end)::public.projector_location
  and i.puzzle_index=substring(pi.piece_id from '([1-5])$')::integer;

insert into public.inventory(group_id,item_id,item_type,source,obtained_station_id,created_at,idempotency_key)
select pi.group_id,pi.canonical_item_id,'puzzle','legacy_token_puzzle',pi.station_id,pi.created_at,
  'legacy-puzzle-inventory:'||pi.inventory_id
from public.puzzle_inventory pi where pi.canonical_item_id is not null
on conflict do nothing;

update public.puzzle_inventory pi set source_inventory_id=inv.id
from public.inventory inv
where pi.source_inventory_id is null and pi.canonical_item_id=inv.item_id and pi.group_id=inv.group_id;

create or replace function public.sync_canonical_puzzle_to_compatibility()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_item public.items%rowtype; v_location integer;
begin
  select * into v_item from public.items where id=new.item_id;
  if not found or v_item.type<>'puzzle' then return new; end if;
  v_location:=case v_item.puzzle_location when 'B1' then 1 when 'A3' then 2 when 'TF' then 3 end;
  update public.puzzle_inventory set group_id=new.group_id,location_id=v_location,
    piece_id=v_item.puzzle_code,station_id=new.obtained_station_id,
    canonical_item_id=new.item_id,attempt_id=new.obtained_attempt_id
  where source_inventory_id=new.id;
  if not found then
    insert into public.puzzle_inventory(group_id,location_id,piece_id,station_id,created_at,canonical_item_id,source_inventory_id,attempt_id)
    values(new.group_id,v_location,v_item.puzzle_code,new.obtained_station_id,new.created_at,new.item_id,new.id,new.obtained_attempt_id);
  end if;
  return new;
end $$;
drop trigger if exists sync_canonical_puzzle_inventory on public.inventory;
create trigger sync_canonical_puzzle_inventory after insert or update of group_id,item_id,status,obtained_station_id,obtained_attempt_id
on public.inventory for each row execute function public.sync_canonical_puzzle_to_compatibility();

create or replace function public.fn_puzzle_eligible(p_group_id integer,p_locations public.projector_location[])
returns table(puzzle_id integer,puzzle_code text,location public.projector_location,puzzle_index integer,display_asset text)
language plpgsql stable security definer set search_path=public as $$
begin
  if not (public.has_permission('logs.puzzle') or public.has_permission('gameplay.day2')
    or p_group_id=public.current_gameplay_group_id()) then raise exception 'PERMISSION_DENIED'; end if;
  return query select i.id,i.puzzle_code,i.puzzle_location,i.puzzle_index,i.display_asset
  from public.items i
  where i.type='puzzle' and i.is_active and i.puzzle_location=any(p_locations)
    and not exists(select 1 from public.inventory inv where inv.group_id=p_group_id and inv.item_id=i.id)
  order by i.puzzle_location,i.puzzle_index;
end
$$;

create or replace function public.fn_grant_puzzle_unchecked(p_attempt_id uuid,p_puzzle_id integer,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_attempt public.game_attempts%rowtype; v_item public.items%rowtype; v_inventory_id bigint;
begin
  if p_request_id is null or length(trim(p_request_id))<8 then raise exception 'INVALID_REQUEST_ID'; end if;
  select * into v_attempt from public.game_attempts where attempt_id=p_attempt_id for update;
  if not found then raise exception 'DAY2_ATTEMPT_NOT_FOUND'; end if;
  select * into v_item from public.items where id=p_puzzle_id and type='puzzle' and is_active;
  if not found then raise exception 'PUZZLE_NOT_AVAILABLE'; end if;
  insert into public.inventory(group_id,item_id,item_type,source,granted_by,idempotency_key,obtained_station_id,obtained_attempt_id)
  values(v_attempt.group_id,v_item.id,'puzzle','day2_attempt',auth.uid(),p_request_id,v_attempt.station_id,v_attempt.attempt_id)
  returning id into v_inventory_id;
  update public.game_attempts set reward_puzzle_id=v_item.puzzle_code,status='REWARD_GENERATED',version=version+1
    where attempt_id=v_attempt.attempt_id;
  insert into public.group_notifications(group_id,notification_type,message,reference_id)
    values(v_attempt.group_id,'PUZZLE_RECEIVED','Your group received Puzzle '||v_item.puzzle_code||'.',v_inventory_id::text);
  perform public.audit('puzzle.grant','inventory:'||v_inventory_id,
    jsonb_build_object('group_id',v_attempt.group_id,'puzzle_code',v_item.puzzle_code,'attempt_id',v_attempt.attempt_id));
  return jsonb_build_object('ok',true,'inventory_id',v_inventory_id,'puzzle_id',v_item.id,'puzzle_code',v_item.puzzle_code);
exception when unique_violation then raise exception 'DUPLICATE_PUZZLE_PIECE';
end $$;

create or replace function public.fn_admin_update_puzzle(
  p_puzzle_id integer,p_code text,p_location public.projector_location,p_is_active boolean,
  p_expected_version bigint,p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_old public.items%rowtype;
begin
  if not public.has_permission('logs.puzzle') then raise exception 'PERMISSION_DENIED'; end if;
  if nullif(trim(p_code),'') is null or nullif(trim(p_reason),'') is null then raise exception 'PUZZLE_CONFIGURATION_INVALID'; end if;
  select * into v_old from public.items where id=p_puzzle_id and type='puzzle' for update;
  if not found then raise exception 'PUZZLE_NOT_FOUND'; end if;
  if v_old.version<>p_expected_version then raise exception 'CONFIGURATION_CONFLICT'; end if;
  update public.items set puzzle_code=upper(trim(p_code)),puzzle_location=p_location,is_active=p_is_active,version=version+1
    where id=p_puzzle_id;
  update public.puzzle_inventory set
    piece_id=upper(trim(p_code)),
    location_id=case p_location when 'B1' then 1 when 'A3' then 2 when 'TF' then 3 end
  where canonical_item_id=p_puzzle_id;
  perform public.audit('puzzle.configure','puzzle:'||p_puzzle_id,
    jsonb_build_object('old_code',v_old.puzzle_code,'new_code',upper(trim(p_code)),'old_location',v_old.puzzle_location,'new_location',p_location,'reason',p_reason));
  return jsonb_build_object('ok',true,'version',v_old.version+1);
end $$;

create or replace function public.fn_admin_correct_puzzle_ownership(
  p_inventory_id bigint,p_new_group_id integer,p_new_puzzle_id integer,p_new_status text,
  p_reason text,p_confirm_dependency boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_old public.inventory%rowtype; v_dependency boolean;
begin
  if not public.has_permission('logs.puzzle') then raise exception 'PERMISSION_DENIED'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'CORRECTION_REASON_REQUIRED'; end if;
  if p_new_status not in ('COLLECTED','REDEEMED') then raise exception 'INVALID_PUZZLE_STATUS'; end if;
  if not exists(select 1 from public.groups where id=p_new_group_id) then raise exception 'GROUP_NOT_FOUND'; end if;
  if not exists(select 1 from public.items where id=p_new_puzzle_id and type='puzzle') then raise exception 'PUZZLE_NOT_FOUND'; end if;
  select * into v_old from public.inventory where id=p_inventory_id and item_type='puzzle' for update;
  if not found then raise exception 'PUZZLE_OWNERSHIP_NOT_FOUND'; end if;
  v_dependency:=v_old.status='REDEEMED' or v_old.redeemed_at is not null or v_old.redeemed_by_nfc_id is not null
    or exists(select 1 from public.puzzle_redemptions r join public.items i on i.id=v_old.item_id
      where r.group_id=v_old.group_id and r.location=i.puzzle_location);
  if v_dependency and not p_confirm_dependency then raise exception 'PUZZLE_REDEMPTION_DEPENDENCY'; end if;
  update public.inventory set group_id=p_new_group_id,item_id=p_new_puzzle_id,status=p_new_status,
    redeemed_at=case when p_new_status='REDEEMED' then coalesce(redeemed_at,now()) else null end,
    redeemed_by_nfc_id=case when p_new_status='REDEEMED' then redeemed_by_nfc_id else null end,
    version=version+1 where id=p_inventory_id;
  insert into public.puzzle_ownership_corrections(inventory_id,old_group_id,new_group_id,old_item_id,new_item_id,
    old_status,new_status,dependency_warning,reason,edited_by)
  values(p_inventory_id,v_old.group_id,p_new_group_id,v_old.item_id,p_new_puzzle_id,v_old.status,p_new_status,v_dependency,p_reason,auth.uid());
  perform public.audit('puzzle.ownership.correct','inventory:'||p_inventory_id,
    jsonb_build_object('old_group',v_old.group_id,'new_group',p_new_group_id,'old_item',v_old.item_id,'new_item',p_new_puzzle_id,'reason',p_reason));
  return jsonb_build_object('ok',true,'dependency_warning',v_dependency);
exception when unique_violation then raise exception 'DUPLICATE_PUZZLE_PIECE';
end $$;

-- Token resets must never erase Puzzle ownership/history.
create or replace function public.fn_reset_token_state(p_reason text default 'Admin system reset')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_group record; v_count integer:=0;
begin
  if not public.has_permission('token.manage') then raise exception 'PERMISSION_DENIED'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'CORRECTION_REASON_REQUIRED'; end if;
  for v_group in select id,coalesce(current_tokens,token_balance,0) as balance from public.groups order by id for update loop
    if v_group.balance<>0 then
      perform public.fn_token_apply_unchecked(v_group.id,-v_group.balance,'SYSTEM_RESET','SYSTEM_RESET',
        'system-reset:'||gen_random_uuid(),null,null,p_reason,false);
      v_count:=v_count+1;
    end if;
  end loop;
  perform public.audit('tokens.reset','all_groups',jsonb_build_object('reason',p_reason,'groups_reset',v_count));
  return jsonb_build_object('ok',true,'groups_reset',v_count);
end $$;

drop policy if exists "admin reads all inventory" on public.inventory;
create policy "admin reads all inventory" on public.inventory for select using(public.has_permission('logs.puzzle'));
drop policy if exists "permitted users read puzzle inventory" on public.puzzle_inventory;
drop policy if exists "admin corrects puzzle inventory" on public.puzzle_inventory;
create policy "own group or admin reads puzzle compatibility" on public.puzzle_inventory for select using(
  public.has_permission('logs.puzzle') or group_id=public.current_gameplay_group_id()
  or (public.has_permission('gameplay.day2') and station_id in(select station_id from public.gm_station_assignments where user_id=auth.uid()))
);
alter table public.puzzle_ownership_corrections enable row level security;
create policy "admin reads puzzle corrections" on public.puzzle_ownership_corrections for select using(public.has_permission('logs.puzzle'));

revoke insert,update,delete on public.puzzle_inventory from authenticated;
revoke all on public.puzzle_ownership_corrections from anon;
grant select on public.puzzle_ownership_corrections to authenticated;
revoke all on function public.fn_grant_puzzle_unchecked(uuid,integer,text) from public,anon,authenticated;
revoke all on function public.fn_puzzle_eligible(integer,public.projector_location[]) from public,anon;
revoke all on function public.fn_admin_update_puzzle(integer,text,public.projector_location,boolean,bigint,text),public.fn_admin_correct_puzzle_ownership(bigint,integer,integer,text,text,boolean) from public,anon;
grant execute on function public.fn_puzzle_eligible(integer,public.projector_location[]) to authenticated;
grant execute on function public.fn_admin_update_puzzle(integer,text,public.projector_location,boolean,bigint,text),public.fn_admin_correct_puzzle_ownership(bigint,integer,integer,text,text,boolean) to authenticated;
