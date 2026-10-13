-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0073: Facilitators' manual location updates (changesv4.md)
--
-- A text-only record of where each Facilitator says they are: a status
-- (Heading to / Arrived / Other + typed text) and a building. It is NOT linked
-- to GPS, the map, or station check-in, and holds no coordinates.
--
--   Faci   adds entries for themselves (fn_faci_log_location) and reads their own.
--   Admin  reads everything and edits a Facilitator's LATEST entry in place
--          (fn_admin_edit_faci_location); the edit is marked and audited.
--   HOF / HOGM / Committee can read all entries.
--   Nobody writes to the table directly.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.faci_location_updates (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  status      text not null check (status in ('heading_to', 'arrived', 'other')),
  -- the typed status, only for 'other'
  other_text  text,
  building    text not null
    check (building in ('A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'Track & Field')),
  created_at  timestamptz not null default now(),
  edited_by   uuid references public.profiles (id),
  edited_at   timestamptz,
  constraint faci_loc_other_text check (
    (status = 'other' and other_text is not null and char_length(btrim(other_text)) between 1 and 60)
    or (status <> 'other' and other_text is null)
  )
);

create index if not exists faci_location_updates_user_idx
  on public.faci_location_updates (user_id, created_at desc);

alter table public.faci_location_updates enable row level security;

drop policy if exists "faci reads own location updates" on public.faci_location_updates;
create policy "faci reads own location updates" on public.faci_location_updates
  for select using (user_id = auth.uid() and public.my_role() = 'faci');

drop policy if exists "committee reads all location updates" on public.faci_location_updates;
create policy "committee reads all location updates" on public.faci_location_updates
  for select using (public.is_committee());

revoke all on public.faci_location_updates from public, anon, authenticated;
grant select on public.faci_location_updates to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.faci_location_updates;
exception when others then null; end $$;

-- ── Faci adds an entry for themselves ───────────────────────────────────

create or replace function public.fn_faci_log_location(
  p_status     text,
  p_other_text text,
  p_building   text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_text text := nullif(btrim(coalesce(p_other_text, '')), '');
  v_id   bigint;
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

  insert into public.faci_location_updates (user_id, status, other_text, building)
  values (auth.uid(), p_status, v_text, p_building)
  returning id into v_id;

  perform public.audit('faci_location.log', 'faci:' || auth.uid(),
    jsonb_build_object('id', v_id, 'status', p_status, 'other_text', v_text, 'building', p_building));
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ── Admin edits a Facilitator's latest entry ────────────────────────────

create or replace function public.fn_admin_edit_faci_location(
  p_id         bigint,
  p_status     text,
  p_other_text text,
  p_building   text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_row  public.faci_location_updates;
  v_text text := nullif(btrim(coalesce(p_other_text, '')), '');
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

  update public.faci_location_updates
     set status = p_status, other_text = v_text, building = p_building,
         edited_by = auth.uid(), edited_at = now()
   where id = p_id;

  perform public.audit('faci_location.edit', 'faci:' || v_row.user_id,
    jsonb_build_object('id', p_id,
      'before', jsonb_build_object('status', v_row.status, 'other_text', v_row.other_text, 'building', v_row.building),
      'after',  jsonb_build_object('status', p_status, 'other_text', v_text, 'building', p_building)));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fn_faci_log_location(text, text, text) from public, anon;
revoke all on function public.fn_admin_edit_faci_location(bigint, text, text, text) from public, anon;
grant execute on function public.fn_faci_log_location(text, text, text) to authenticated;
grant execute on function public.fn_admin_edit_faci_location(bigint, text, text, text) to authenticated;
