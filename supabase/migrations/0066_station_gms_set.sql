-- Migration 0066: set a station's Game Masters in one call (tick-and-save dialog).
-- p_user_ids is the full list for the station. Listed GMs are assigned (a GM who
-- already has another station that day is moved); unlisted GMs are removed from it.

create or replace function public.fn_admin_set_station_gms(p_station_id integer, p_user_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_day integer;
  v_ids uuid[] := coalesce(p_user_ids, '{}');
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  select day into v_day from public.stations where id = p_station_id;
  if not found then
    raise exception 'STATION_NOT_FOUND';
  end if;
  if exists (
    select 1 from unnest(v_ids) u
     where not exists (
       select 1 from public.profiles p
        where p.id = u and p.role in ('gm', 'guardian_gm'))
  ) then
    raise exception 'NOT_A_GAME_MASTER';
  end if;

  delete from public.gm_station_assignments
   where station_id = p_station_id and not (user_id = any (v_ids));

  insert into public.gm_station_assignments (user_id, day, station_id, created_by, updated_by)
  select u, v_day, p_station_id, auth.uid(), auth.uid() from unnest(v_ids) u
  on conflict (user_id, day) do update
    set station_id = excluded.station_id, updated_by = auth.uid()
    where public.gm_station_assignments.station_id is distinct from excluded.station_id;

  perform public.audit('station.gm_set', 'station:' || p_station_id,
    jsonb_build_object('day', v_day, 'user_ids', v_ids));
  return jsonb_build_object('ok', true);
end;
$$;
