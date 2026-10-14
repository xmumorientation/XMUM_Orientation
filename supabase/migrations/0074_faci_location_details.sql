-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0074: optional "details" on a Facilitator's location update
--
-- A free-text comment (up to 200 characters) next to the status and building.
-- It is optional: an update can be sent with it left empty. Admin can edit it
-- together with the latest entry. Run after 0073.
--
-- The two functions gain a last parameter p_details with a default, so a call
-- without it still works. The 0073 versions are dropped (otherwise a call
-- with three arguments would be ambiguous).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.faci_location_updates
  add column if not exists details text
    check (details is null or char_length(details) <= 200);

drop function if exists public.fn_faci_log_location(text, text, text);
drop function if exists public.fn_admin_edit_faci_location(bigint, text, text, text);

create or replace function public.fn_faci_log_location(
  p_status     text,
  p_other_text text,
  p_building   text,
  p_details    text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_text    text := nullif(btrim(coalesce(p_other_text, '')), '');
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_id      bigint;
begin
  if public.my_role() is distinct from 'faci' then
    raise exception 'PERMISSION_DENIED';
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

  insert into public.faci_location_updates (user_id, status, other_text, building, details)
  values (auth.uid(), p_status, v_text, p_building, v_details)
  returning id into v_id;

  perform public.audit('faci_location.log', 'faci:' || auth.uid(),
    jsonb_build_object('id', v_id, 'status', p_status, 'other_text', v_text,
                       'building', p_building, 'details', v_details));
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
  -- only the newest entry of a Facilitator is editable; earlier ones are history
  if exists (
    select 1 from public.faci_location_updates n
     where n.user_id = v_row.user_id
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

  perform public.audit('faci_location.edit', 'faci:' || v_row.user_id,
    jsonb_build_object('id', p_id,
      'before', jsonb_build_object('status', v_row.status, 'other_text', v_row.other_text,
                                   'building', v_row.building, 'details', v_row.details),
      'after',  jsonb_build_object('status', p_status, 'other_text', v_text,
                                   'building', p_building, 'details', v_details)));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fn_faci_log_location(text, text, text, text) from public, anon;
revoke all on function public.fn_admin_edit_faci_location(bigint, text, text, text, text) from public, anon;
grant execute on function public.fn_faci_log_location(text, text, text, text) to authenticated;
grant execute on function public.fn_admin_edit_faci_location(bigint, text, text, text, text) to authenticated;
