-- Migration 0124: OC shares its location too, and everyone sees the staff pins.
--
-- Ben (2026-11-05):
--   * OC can turn on Share Location, like HOF and HOGM. The app already showed
--     OC the switch, but 0103 refused it (PERMISSION_DENIED).
--   * Whoever can see the group locations can see the HOF, HOGM and OC pins.
--     Group locations are open to every signed-in account (0108), so
--     fn_staff_positions() now is too, Freshies included.
-- The bodies are 0103's with the role lists changed. Signatures and grants
-- are unchanged. Safe to run again.

create or replace function public.fn_staff_location_share(p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(public.my_role() in ('hof','oc','hogm'), false) then raise exception 'PERMISSION_DENIED'; end if;
  if p_enabled is null then raise exception 'INVALID_STATE'; end if;
  insert into public.staff_locations(user_id, sharing) values (auth.uid(), p_enabled)
  on conflict (user_id) do update set sharing = excluded.sharing,
    lat = null, lng = null, accuracy_m = null, updated_at = now();
end;
$$;

create or replace function public.fn_report_staff_gps(p_lat double precision, p_lng double precision, p_accuracy double precision)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(public.my_role() in ('hof','oc','hogm'), false) then raise exception 'PERMISSION_DENIED'; end if;
  if p_lat is null or p_lng is null or not (p_lat between -90 and 90 and p_lng between -180 and 180)
    or (p_accuracy is not null and not (p_accuracy between 0 and 1000)) then raise exception 'INVALID_POSITION'; end if;
  -- A delayed report can never enable sharing again after Stop has committed.
  update public.staff_locations set lat = p_lat, lng = p_lng, accuracy_m = p_accuracy, updated_at = now()
    where user_id = auth.uid() and sharing;
end;
$$;

-- Same rule as fn_group_positions() (0108): any signed-in account.
create or replace function public.fn_staff_positions()
returns table(user_id uuid, full_name text, role text, lat double precision, lng double precision,
  accuracy_m double precision, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.user_id, p.full_name::text, p.role::text, l.lat, l.lng, l.accuracy_m, l.updated_at
  from public.staff_locations l join public.profiles p on p.id = l.user_id
  where auth.uid() is not null
    and p.role in ('hof','oc','hogm') and l.sharing and l.lat is not null and l.lng is not null
    and l.updated_at > now() - interval '2 minutes';
$$;

revoke all on function public.fn_staff_location_share(boolean) from public, anon;
revoke all on function public.fn_report_staff_gps(double precision,double precision,double precision) from public, anon;
revoke all on function public.fn_staff_positions() from public, anon;
grant execute on function public.fn_staff_location_share(boolean) to authenticated;
grant execute on function public.fn_report_staff_gps(double precision,double precision,double precision) to authenticated;
grant execute on function public.fn_staff_positions() to authenticated;
