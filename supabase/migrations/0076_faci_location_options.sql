-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0076: Admin manages the location options (A1, A3, ...)
--
-- The buildings a Facilitator can pick used to be a fixed list. They are now
-- rows Admin creates, renames, reorders and deletes (Admin → Headcount and
-- location → Locations). Run after 0075.
--
--   * Seeded with the old list: A1-A5, B1, Track & Field.
--   * Everyone signed in can read the options (the Facilitator form needs
--     them); only Admin changes them, through the functions below.
--   * Rename: the option and every earlier update that used the old name move
--     to the new name together, so history stays consistent.
--   * Delete: an option nobody has used is removed. One that updates already
--     use is ARCHIVED instead: it disappears from the dropdowns, and the
--     updates that used it keep their text.
--   * An update stores the option's name (text), so history reads the same
--     even after changes.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.faci_location_options (
  id         serial primary key,
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  sort_order integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- names are unique among live options (an archived "A1" does not block a new "A1")
create unique index if not exists faci_location_options_name_uq
  on public.faci_location_options (lower(name)) where active;

insert into public.faci_location_options (name, sort_order)
select v.name, v.ord
  from (values ('A1', 10), ('A2', 20), ('A3', 30), ('A4', 40), ('A5', 50), ('B1', 60), ('Track & Field', 70)) as v(name, ord)
 where not exists (select 1 from public.faci_location_options);

alter table public.faci_location_options enable row level security;

drop policy if exists "signed-in users read location options" on public.faci_location_options;
create policy "signed-in users read location options" on public.faci_location_options
  for select to authenticated using (true);

revoke all on public.faci_location_options from public, anon, authenticated;
grant select on public.faci_location_options to authenticated;
grant usage, select on sequence public.faci_location_options_id_seq to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.faci_location_options;
exception when others then null; end $$;

-- An update's building is the option's name (text): no fixed list any more.
alter table public.faci_location_updates drop constraint if exists faci_location_updates_building_check;
alter table public.faci_location_updates
  add constraint faci_location_updates_building_len check (char_length(btrim(building)) between 1 and 40);

-- ── Admin: create / rename ──────────────────────────────────────────────

create or replace function public.fn_admin_location_option_save(p_id integer, p_name text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_old  text;
  v_id   integer;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'LOC_OPTION_NAME_INVALID';
  end if;

  begin
    if p_id is null then
      insert into public.faci_location_options (name, sort_order)
      values (v_name, coalesce((select max(sort_order) from public.faci_location_options), 0) + 10)
      returning id into v_id;
    else
      select name into v_old from public.faci_location_options where id = p_id for update;
      if not found then
        raise exception 'LOC_OPTION_NOT_FOUND';
      end if;
      update public.faci_location_options set name = v_name where id = p_id;
      -- earlier updates follow the rename
      if v_old is distinct from v_name then
        update public.faci_location_updates set building = v_name where building = v_old;
      end if;
      v_id := p_id;
    end if;
  exception when unique_violation then
    raise exception 'LOC_OPTION_EXISTS';
  end;

  perform public.audit('faci_location.option_save', 'option:' || v_id,
    jsonb_build_object('name', v_name, 'renamed_from', v_old, 'created', p_id is null));
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ── Admin: delete (archive when updates already use it) ─────────────────

create or replace function public.fn_admin_location_option_delete(p_id integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  select name into v_name from public.faci_location_options where id = p_id for update;
  if not found then
    raise exception 'LOC_OPTION_NOT_FOUND';
  end if;

  if exists (select 1 from public.faci_location_updates where building = v_name) then
    update public.faci_location_options set active = false where id = p_id;
    perform public.audit('faci_location.option_archive', 'option:' || p_id, jsonb_build_object('name', v_name));
    return jsonb_build_object('ok', true, 'archived', true);
  end if;

  delete from public.faci_location_options where id = p_id;
  perform public.audit('faci_location.option_delete', 'option:' || p_id, jsonb_build_object('name', v_name));
  return jsonb_build_object('ok', true, 'archived', false);
end;
$$;

-- ── Admin: move up / down ───────────────────────────────────────────────

create or replace function public.fn_admin_location_option_move(p_id integer, p_direction integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me    public.faci_location_options;
  v_other public.faci_location_options;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  select * into v_me from public.faci_location_options where id = p_id and active for update;
  if not found then
    raise exception 'LOC_OPTION_NOT_FOUND';
  end if;
  if p_direction < 0 then
    select * into v_other from public.faci_location_options
     where active and (sort_order, id) < (v_me.sort_order, v_me.id)
     order by sort_order desc, id desc limit 1;
  else
    select * into v_other from public.faci_location_options
     where active and (sort_order, id) > (v_me.sort_order, v_me.id)
     order by sort_order, id limit 1;
  end if;
  if not found then
    return jsonb_build_object('ok', true, 'moved', false);
  end if;
  -- swap; equal sort orders are separated by id so the swap is always visible
  update public.faci_location_options set sort_order = v_other.sort_order where id = v_me.id;
  update public.faci_location_options set sort_order = v_me.sort_order where id = v_other.id;
  if v_me.sort_order = v_other.sort_order then
    update public.faci_location_options
       set sort_order = sort_order + (case when p_direction < 0 then -1 else 1 end)
     where id = v_me.id;
  end if;
  return jsonb_build_object('ok', true, 'moved', true);
end;
$$;

-- ── The two update functions now check the live options ───────────────

create or replace function public.fn_faci_log_location(
  p_status     text,
  p_other_text text,
  p_building   text,
  p_details    text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_group   integer := public.my_group_id();
  v_text    text := nullif(btrim(coalesce(p_other_text, '')), '');
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_id      bigint;
begin
  if public.my_role() is distinct from 'faci' then
    raise exception 'PERMISSION_DENIED';
  end if;
  if v_group is null then
    raise exception 'NOT_IN_GROUP';
  end if;
  if p_status not in ('heading_to', 'arrived', 'other') then
    raise exception 'LOC_STATUS_INVALID';
  end if;
  if p_status = 'other' then
    if v_text is null then
      raise exception 'LOC_OTHER_TEXT_REQUIRED';
    end if;
    if char_length(v_text) > 60 then
      raise exception 'LOC_OTHER_TEXT_TOO_LONG';
    end if;
  else
    v_text := null;
  end if;
  if not exists (select 1 from public.faci_location_options o where o.active and o.name = p_building) then
    raise exception 'LOC_BUILDING_INVALID';
  end if;
  if v_details is not null and char_length(v_details) > 200 then
    raise exception 'LOC_DETAILS_TOO_LONG';
  end if;

  insert into public.faci_location_updates (user_id, group_id, status, other_text, building, details)
  values (auth.uid(), v_group, p_status, v_text, p_building, v_details)
  returning id into v_id;

  perform public.audit('faci_location.log', 'group:' || v_group,
    jsonb_build_object('id', v_id, 'sent_by', auth.uid(), 'status', p_status,
                       'other_text', v_text, 'building', p_building, 'details', v_details));
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.fn_admin_edit_faci_location(
  p_id         bigint,
  p_status     text,
  p_other_text text,
  p_building   text,
  p_details    text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_row     public.faci_location_updates;
  v_text    text := nullif(btrim(coalesce(p_other_text, '')), '');
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  select * into v_row from public.faci_location_updates where id = p_id for update;
  if not found then
    raise exception 'LOC_NOT_FOUND';
  end if;
  if exists (
    select 1 from public.faci_location_updates n
     where n.group_id = v_row.group_id
       and (n.created_at, n.id) > (v_row.created_at, v_row.id)
  ) then
    raise exception 'LOC_NOT_LATEST';
  end if;
  if p_status not in ('heading_to', 'arrived', 'other') then
    raise exception 'LOC_STATUS_INVALID';
  end if;
  if p_status = 'other' then
    if v_text is null then
      raise exception 'LOC_OTHER_TEXT_REQUIRED';
    end if;
    if char_length(v_text) > 60 then
      raise exception 'LOC_OTHER_TEXT_TOO_LONG';
    end if;
  else
    v_text := null;
  end if;
  -- a live option, or the one this update already has (it may have been archived since)
  if p_building is distinct from v_row.building
     and not exists (select 1 from public.faci_location_options o where o.active and o.name = p_building) then
    raise exception 'LOC_BUILDING_INVALID';
  end if;
  if v_details is not null and char_length(v_details) > 200 then
    raise exception 'LOC_DETAILS_TOO_LONG';
  end if;

  update public.faci_location_updates
     set status = p_status, other_text = v_text, building = p_building, details = v_details,
         edited_by = auth.uid(), edited_at = now()
   where id = p_id;

  perform public.audit('faci_location.edit', 'group:' || v_row.group_id,
    jsonb_build_object('id', p_id,
      'before', jsonb_build_object('status', v_row.status, 'other_text', v_row.other_text,
                                   'building', v_row.building, 'details', v_row.details),
      'after',  jsonb_build_object('status', p_status, 'other_text', v_text,
                                   'building', p_building, 'details', v_details)));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fn_admin_location_option_save(integer, text) from public, anon;
revoke all on function public.fn_admin_location_option_delete(integer) from public, anon;
revoke all on function public.fn_admin_location_option_move(integer, integer) from public, anon;
grant execute on function public.fn_admin_location_option_save(integer, text) to authenticated;
grant execute on function public.fn_admin_location_option_delete(integer) to authenticated;
grant execute on function public.fn_admin_location_option_move(integer, integer) to authenticated;
