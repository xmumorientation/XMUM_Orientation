-- Migration 0071: fix Admin → Stations not showing the assigned Game Masters
--
-- Symptom: "Game Masters saved." appears, the assignment is stored, but the
-- row still says "Unassigned · click to assign".
-- Cause: fn_admin_station_gms() (0065) declares its result as
--   (user_id uuid, station_id integer, day integer)
-- but on the live database gm_station_assignments.day is smallint (the table
-- already existed with a different shape, so 0065's create-if-not-exists kept
-- it). Postgres then fails with "structure of query does not match function
-- result type", the page gets no rows, and every station looks unassigned.
-- Fix: cast the columns to the declared types. Same signature, so this
-- replaces the function in place and keeps its grants.

create or replace function public.fn_admin_station_gms()
returns table (user_id uuid, station_id integer, day integer)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  return query
    select a.user_id, a.station_id::integer, a.day::integer
      from public.gm_station_assignments a;
end;
$$;
