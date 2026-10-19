-- Migration 0079: HOGM can read station Game Masters again
--
-- Symptom: HOGM → Ops → Stations shows "You don't have permission to do
-- that." as soon as it loads.
-- Cause: on the live database fn_admin_station_gms() does not use
-- is_game_lead(), so 0071's swap was lost (a later run of an older version
-- replaced it) and HOGM gets PERMISSION_DENIED.
-- Also: is_admin() and my_role() return NULL for a caller who is not logged
-- in, so "if not (is_admin() or my_role() = 'hogm')" never raised for anon
-- and handed them every assignment. is_game_lead() coalesces to false.
-- Same signature, so this replaces the function in place. The grants at the
-- end then take anon off it: only logged-in users can call it.

create or replace function public.fn_admin_station_gms()
returns table (user_id uuid, station_id integer, day integer)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_game_lead() then
    raise exception 'PERMISSION_DENIED';
  end if;
  return query
    select a.user_id, a.station_id::integer, a.day::integer
      from public.gm_station_assignments a;
end;
$$;

revoke all on function public.fn_admin_station_gms() from public, anon;
grant execute on function public.fn_admin_station_gms() to authenticated;
