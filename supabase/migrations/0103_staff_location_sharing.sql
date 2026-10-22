-- Opt-in HOF/HOGM locations. One current fix per person; no location history.
create table public.staff_locations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  sharing boolean not null default false,
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  updated_at timestamptz not null default now(),
  check (lat between -90 and 90 and lng between -180 and 180),
  check (accuracy_m is null or accuracy_m between 0 and 1000)
);
alter table public.staff_locations enable row level security;
revoke all on public.staff_locations from public, anon, authenticated;

create function public.fn_staff_location_share(p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(public.my_role() in ('hof','hogm'), false) then raise exception 'PERMISSION_DENIED'; end if;
  if p_enabled is null then raise exception 'INVALID_STATE'; end if;
  insert into public.staff_locations(user_id, sharing) values (auth.uid(), p_enabled)
  on conflict (user_id) do update set sharing = excluded.sharing,
    lat = null, lng = null, accuracy_m = null, updated_at = now();
end;
$$;

create function public.fn_report_staff_gps(p_lat double precision, p_lng double precision, p_accuracy double precision)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(public.my_role() in ('hof','hogm'), false) then raise exception 'PERMISSION_DENIED'; end if;
  if p_lat is null or p_lng is null or not (p_lat between -90 and 90 and p_lng between -180 and 180)
    or (p_accuracy is not null and not (p_accuracy between 0 and 1000)) then raise exception 'INVALID_POSITION'; end if;
  -- A delayed report can never enable sharing again after Stop has committed.
  update public.staff_locations set lat = p_lat, lng = p_lng, accuracy_m = p_accuracy, updated_at = now()
    where user_id = auth.uid() and sharing;
end;
$$;

create function public.fn_staff_positions()
returns table(user_id uuid, full_name text, role text, lat double precision, lng double precision,
  accuracy_m double precision, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.user_id, p.full_name::text, p.role::text, l.lat, l.lng, l.accuracy_m, l.updated_at
  from public.staff_locations l join public.profiles p on p.id = l.user_id
  where coalesce(public.my_role() in ('faci','gm','guardian_gm','committee','hof','hogm','admin'), false)
    and p.role in ('hof','hogm') and l.sharing and l.lat is not null and l.lng is not null
    and l.updated_at > now() - interval '2 minutes';
$$;
revoke all on function public.fn_staff_location_share(boolean) from public, anon;
revoke all on function public.fn_report_staff_gps(double precision,double precision,double precision) from public, anon;
revoke all on function public.fn_staff_positions() from public, anon;
grant execute on function public.fn_staff_location_share(boolean) to authenticated;
grant execute on function public.fn_report_staff_gps(double precision,double precision,double precision) to authenticated;
grant execute on function public.fn_staff_positions() to authenticated;
