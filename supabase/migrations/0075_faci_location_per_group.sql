-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0075: a location update belongs to the GROUP, not to one Faci
--
-- Any Facilitator in Group 1 can send Group 1's location, and the whole
-- group shares that one latest update (like the headcount). Each entry still
-- records which Facilitator sent it (user_id). Run after 0073 and 0074.
--
--   Faci   adds an entry for their own group (a Faci with no group cannot) and
--          reads their group's entries.
--   Admin  reads everything; edits a group's LATEST entry in place (marked,
--          audited). HOF / HOGM / Committee read all.
--
-- Existing entries are moved onto their Facilitator's group. Entries from a
-- Facilitator who had no group cannot belong to any group and are removed
-- (they were test entries).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.faci_location_updates
  add column if not exists group_id integer references public.groups (id) on delete cascade;

update public.faci_location_updates u
   set group_id = p.group_id
  from public.profiles p
 where p.id = u.user_id and u.group_id is null;

delete from public.faci_location_updates where group_id is null;

alter table public.faci_location_updates alter column group_id set not null;

create index if not exists faci_location_updates_group_idx
  on public.faci_location_updates (group_id, created_at desc, id desc);

-- A Faci reads their group's entries (not only their own).
drop policy if exists "faci reads own location updates" on public.faci_location_updates;
drop policy if exists "faci reads group location updates" on public.faci_location_updates;
create policy "faci reads group location updates" on public.faci_location_updates
  for select using (public.my_role() = 'faci' and group_id = public.my_group_id());

-- ── Faci adds an entry for their group ──────────────────────────────────

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
  if p_building not in ('A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'Track & Field') then
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

-- ── Admin edits a group's latest entry ──────────────────────────────────

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
  -- only the newest entry of a group is editable; earlier ones are history
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
  if p_building not in ('A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'Track & Field') then
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

-- same signatures as 0074, so the grants carry over; stated again for clarity
revoke all on function public.fn_faci_log_location(text, text, text, text) from public, anon;
revoke all on function public.fn_admin_edit_faci_location(bigint, text, text, text, text) from public, anon;
grant execute on function public.fn_faci_log_location(text, text, text, text) to authenticated;
grant execute on function public.fn_admin_edit_faci_location(bigint, text, text, text, text) to authenticated;
