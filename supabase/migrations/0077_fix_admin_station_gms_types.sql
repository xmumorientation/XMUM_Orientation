-- Migration 0077: fix Admin → Stations not showing the assigned Game Masters
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
--
-- Permission: Admin and HOGM, the same as main's 0071_hogm_game_control, which
-- swaps this function's is_admin() check for is_game_lead(). This version
-- allows both directly, so it is safe to run before OR after that migration
-- (and that migration still finds exactly one is_admin() check to swap).

create or replace function public.fn_admin_station_gms()
returns table (user_id uuid, station_id integer, day integer)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (public.is_admin() or public.my_role() = 'hogm') then
    raise exception 'PERMISSION_DENIED';
  end if;
  return query
    select a.user_id, a.station_id::integer, a.day::integer
      from public.gm_station_assignments a;
end;
$$;
