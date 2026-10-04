-- SECTION 16: shared Lighting Zone state metadata and replaceable UI effects.

alter table public.projectors
  add column if not exists activated_by_nfc_id integer references public.nfc_tokens(id),
  add column if not exists updated_at timestamptz not null default now();

-- Backfill the NFC that produced each existing activation where possible.
with latest_card as (
  select distinct on(location,used_by_group) id,location,used_by_group,used_at
  from public.nfc_tokens where used_at is not null order by location,used_by_group,used_at desc
)
update public.projectors p set activated_by_nfc_id=n.id,updated_at=coalesce(n.used_at,p.activated_at,now())
from latest_card n
where p.activated_by_group=n.used_by_group and p.location=n.location and p.activated_at is not null
  and n.used_at is not null and p.activated_by_nfc_id is null;

create or replace function public.sync_zone_nfc_metadata()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='USED' and new.used_by_group is not null then
    update public.projectors set activated_by_nfc_id=new.id,updated_at=now()
      where location=new.location and activated_by_group=new.used_by_group and activated_at is not null;
  end if;
  return new;
end $$;
drop trigger if exists sync_zone_nfc_after_card_use on public.nfc_tokens;
create trigger sync_zone_nfc_after_card_use after update of status,used_by_group,used_at on public.nfc_tokens
for each row execute function public.sync_zone_nfc_metadata();

insert into public.game_setting_definitions(setting_key,value_type,min_value,max_value,allowed_values,description) values
  ('lighting_effect_scope','text',null,null,'["SCANNING_DEVICE","ALL_VIEWERS","NONE"]'::jsonb,'Which connected devices play activation effects'),
  ('lighting_effect_style','text',null,null,'["GLOW","PULSE","NONE"]'::jsonb,'Replaceable Lighting Zone effect style'),
  ('lighting_effect_duration_ms','integer',0,10000,null,'Lighting Zone effect duration in milliseconds')
on conflict(setting_key) do update set value_type=excluded.value_type,min_value=excluded.min_value,
  max_value=excluded.max_value,allowed_values=excluded.allowed_values,description=excluded.description;
insert into public.game_config(key,value) values
  ('lighting_effect_scope','"ALL_VIEWERS"'),('lighting_effect_style','"GLOW"'),('lighting_effect_duration_ms','2400')
on conflict(key) do nothing;

drop function if exists public.fn_lighting_zones();
create function public.fn_lighting_zones()
returns table(location public.projector_location,name text,activated_by_group integer,activated_group_name text,
  activated_by_nfc_id integer,activated_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_permission('lighting.view') then raise exception 'PERMISSION_DENIED'; end if;
  return query select p.location,p.name,p.activated_by_group,g.name,p.activated_by_nfc_id,p.activated_at,p.updated_at
    from public.projectors p left join public.groups g on g.id=p.activated_by_group order by p.location;
end $$;
revoke all on function public.fn_lighting_zones() from public,anon;
grant execute on function public.fn_lighting_zones() to authenticated;

-- Ensure future Admin/full recovery clears metadata together with ownership.
create or replace function public.clear_zone_nfc_metadata_on_revert()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.activated_at is not null and new.activated_at is null then
    new.activated_by_nfc_id:=null;new.updated_at:=now();
  elsif new.activated_at is distinct from old.activated_at or new.activated_by_group is distinct from old.activated_by_group then
    new.updated_at:=now();
  end if;
  return new;
end $$;
drop trigger if exists clear_zone_metadata_before_update on public.projectors;
create trigger clear_zone_metadata_before_update before update of activated_at,activated_by_group on public.projectors
for each row execute function public.clear_zone_nfc_metadata_on_revert();
