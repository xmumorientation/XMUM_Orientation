-- Migration 0087: Admin accuracy check for the campus map.
--
-- An Admin walks the campus with "Accuracy check" on. Their phone reports its
-- GPS to the server, and they tap where they really are on the art. Each tap
-- saves an anchor (averaged GPS + the tapped spot) that every map adds to the
-- built-in anchors in src/lib/mapGeo.ts.
--
-- * map_anchors: the saved anchors. Everyone signed in can read them (every
--   map needs them); only Admin writes, through the functions below.
-- * fn_admin_add_map_anchor: saves one. An Admin anchor within 15 m replaces
--   the old one, so the same spot is not pinned twice.
-- * fn_admin_delete_map_anchor: removes one. Built-in anchors live in code and
--   cannot be deleted here.
-- * admin_check_locations: Admin phones' GPS while in Accuracy check. Kept
--   apart from group_locations, so it never shows as a group pin. Only Admin
--   can read it (fn_admin_check_locations). Rows older than 1 hour are removed.

create table if not exists public.map_anchors (
  id          bigserial primary key,
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  x           numeric(6, 2) not null check (x between 0 and 100),
  y           numeric(6, 2) not null check (y between 0 and 100),
  accuracy_m  double precision,
  fixes       integer,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);

alter table public.map_anchors enable row level security;
drop policy if exists "signed in reads map anchors" on public.map_anchors;
create policy "signed in reads map anchors" on public.map_anchors
  for select to authenticated using (true);
revoke all on public.map_anchors from public, anon;
grant select on public.map_anchors to authenticated;

create table if not exists public.admin_check_locations (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  accuracy_m  double precision,
  created_at  timestamptz not null default now()
);
create index if not exists admin_check_locations_user_idx
  on public.admin_check_locations (user_id, created_at desc);

alter table public.admin_check_locations enable row level security;
revoke all on public.admin_check_locations from public, anon, authenticated;

-- Distance in metres between two points (haversine).
create or replace function public.geo_distance_m(
  a_lat double precision, a_lng double precision,
  b_lat double precision, b_lng double precision
)
returns double precision
language sql immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(b_lat - a_lat) / 2), 2)
    + cos(radians(a_lat)) * cos(radians(b_lat))
      * power(sin(radians(b_lng - a_lng) / 2), 2)
  ));
$$;

create or replace function public.fn_admin_add_map_anchor(
  p_lat double precision,
  p_lng double precision,
  p_x numeric,
  p_y numeric,
  p_accuracy double precision,
  p_fixes integer
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id bigint;
  v_replaced integer;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_lat is null or p_lng is null or p_x is null or p_y is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or p_x not between 0 and 100 or p_y not between 0 and 100 then
    raise exception 'INVALID_POSITION';
  end if;
  if p_accuracy is null or p_accuracy > 20 then
    raise exception 'GPS_TOO_ROUGH';
  end if;

  with gone as (
    delete from public.map_anchors a
     where public.geo_distance_m(a.lat, a.lng, p_lat, p_lng) < 15
    returning 1
  )
  select count(*) into v_replaced from gone;

  insert into public.map_anchors (lat, lng, x, y, accuracy_m, fixes, created_by)
  values (p_lat, p_lng, round(p_x, 2), round(p_y, 2), p_accuracy, p_fixes, auth.uid())
  returning id into v_id;

  perform public.audit('map.anchor_add', 'map_anchor:' || v_id,
    jsonb_build_object('lat', p_lat, 'lng', p_lng, 'x', p_x, 'y', p_y,
                       'accuracy_m', p_accuracy, 'replaced', v_replaced));
  return jsonb_build_object('ok', true, 'id', v_id, 'replaced', v_replaced);
end;
$$;

create or replace function public.fn_admin_delete_map_anchor(p_id bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  delete from public.map_anchors where id = p_id;
  if not found then
    raise exception 'ANCHOR_NOT_FOUND';
  end if;
  perform public.audit('map.anchor_delete', 'map_anchor:' || p_id, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fn_report_admin_gps(
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_last timestamptz;
  v_accuracy double precision := p_accuracy;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'INVALID_POSITION';
  end if;
  if v_accuracy is not null
     and (v_accuracy < 0 or v_accuracy in ('NaN', 'Infinity')) then
    v_accuracy := null;
  end if;

  select max(created_at) into v_last
    from public.admin_check_locations where user_id = auth.uid();
  if v_last > now() - interval '10 seconds' then
    return jsonb_build_object('ok', true, 'throttled', true);
  end if;

  insert into public.admin_check_locations (user_id, lat, lng, accuracy_m)
  values (auth.uid(), p_lat, p_lng, v_accuracy);

  delete from public.admin_check_locations
   where created_at < now() - interval '1 hour';

  return jsonb_build_object('ok', true);
end;
$$;

-- Newest position of each Admin in Accuracy check (last 10 minutes).
create or replace function public.fn_admin_check_locations()
returns table (
  user_id uuid,
  full_name text,
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  reported_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select distinct on (l.user_id)
         l.user_id, p.full_name, l.lat, l.lng, l.accuracy_m, l.created_at
    from public.admin_check_locations l
    join public.profiles p on p.id = l.user_id
   where public.is_admin()
     and l.created_at > now() - interval '10 minutes'
   order by l.user_id, l.created_at desc;
$$;

revoke all on function public.fn_admin_add_map_anchor(double precision, double precision, numeric, numeric, double precision, integer) from public, anon;
revoke all on function public.fn_admin_delete_map_anchor(bigint) from public, anon;
revoke all on function public.fn_report_admin_gps(double precision, double precision, double precision) from public, anon;
revoke all on function public.fn_admin_check_locations() from public, anon;
grant execute on function public.fn_admin_add_map_anchor(double precision, double precision, numeric, numeric, double precision, integer) to authenticated;
grant execute on function public.fn_admin_delete_map_anchor(bigint) to authenticated;
grant execute on function public.fn_report_admin_gps(double precision, double precision, double precision) to authenticated;
grant execute on function public.fn_admin_check_locations() to authenticated;
