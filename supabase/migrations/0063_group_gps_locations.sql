-- Live group GPS locations for the campus map.
--
-- * fn_latest_gps_locations(): newest GPS report per group from the last
--   hour. Same permission rule as fn_latest_locations: Committee tier
--   (hof, hogm, committee, admin) sees all groups, a Faci sees their own.
--   GM, Guardian GM and Freshie get no rows.
-- * fn_report_gps() now also deletes that group's GPS rows older than one
--   hour, so the table does not grow without limit. Manual check-in rows
--   are kept: the map needs them while a group stays at a station.

create index if not exists group_locations_created_idx
  on public.group_locations (created_at);

create or replace function public.fn_report_gps(
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_group integer := public.my_group_id();
begin
  if public.my_role() <> 'faci' then
    raise exception 'PERMISSION_DENIED';
  end if;
  if v_group is null then
    raise exception 'NOT_IN_GROUP';
  end if;
  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'INVALID_POSITION';
  end if;

  insert into public.group_locations (group_id, source, lat, lng, accuracy_m, reported_by)
  values (v_group, 'gps', p_lat, p_lng, p_accuracy, auth.uid());

  delete from public.group_locations
   where group_id = v_group
     and source = 'gps'
     and created_at < now() - interval '1 hour';

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fn_latest_gps_locations()
returns table (
  group_id integer, group_name text,
  lat double precision, lng double precision,
  accuracy_m double precision, reported_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select distinct on (gl.group_id)
         gl.group_id, g.name, gl.lat, gl.lng, gl.accuracy_m, gl.created_at
    from public.group_locations gl
    join public.groups g on g.id = gl.group_id
   where gl.source = 'gps'
     and gl.created_at > now() - interval '1 hour'
     and (public.is_committee() or gl.group_id = public.my_group_id())
   order by gl.group_id, gl.created_at desc;
$$;

revoke all on function public.fn_latest_gps_locations() from public, anon;
grant execute on function public.fn_latest_gps_locations() to authenticated;
