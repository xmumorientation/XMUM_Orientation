-- Bigger check-in zones for the large buildings.
--
-- The "far from station" warning used a 100 m circle around the station's
-- own point. The A blocks and B1 are large, so a Faci standing inside A3
-- could be called "outside". The warning now only fires when the Faci is
-- outside BOTH the station's own circle and the whole building's circle,
-- and the phone's GPS accuracy is allowed for (up to 100 m).
--
-- Building centres are the real GPS points used by src/lib/mapGeo.ts.
-- The zone never blocks a check-in; it only sets far_away.

create or replace function public.building_geofence(p_area text)
returns table (lat double precision, lng double precision, radius_m integer)
language sql immutable
as $$
  select b.lat, b.lng, b.radius_m
    from (values
      ('A1',            2.830716513626805::double precision, 101.70238566331372::double precision, 90),
      ('A2',            2.830894481771187, 101.70300445323068, 90),
      ('A3',            2.831185702312712, 101.70377875057042, 90),
      ('A4',            2.831229385384772, 101.70461460291834, 90),
      ('A5',            2.8310562554223995, 101.70528647466466, 90),
      ('B1',            2.8326752117750265, 101.70648314368725, 140),
      ('Track & Field', 2.8303729712091497, 101.7068105515868, 130)
    ) as b(area, lat, lng, radius_m)
   where b.area = p_area;
$$;

create or replace function public.fn_manual_checkin(
  p_station_id integer,
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_accuracy   double precision default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_group integer := public.my_group_id();
  v_st    public.stations%rowtype;
  v_prev  integer;
  v_dist  double precision;
  v_bdist double precision;
  v_slack double precision := least(greatest(coalesce(p_accuracy, 0), 0), 100);
  v_far   boolean := false;
  v_b     record;
begin
  if public.my_role() not in ('faci', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if v_group is null then
    raise exception 'NOT_IN_GROUP';
  end if;

  select * into v_st from public.stations where id = p_station_id for update;
  if not found then raise exception 'STATION_NOT_FOUND'; end if;
  if v_st.status = 'closed' then raise exception 'STATION_CLOSED'; end if;

  select station_id into v_prev
    from public.station_occupancy where group_id = v_group;

  if v_prev is distinct from p_station_id
     and v_st.max_groups is not null
     and (select count(*) from public.station_occupancy
           where station_id = p_station_id) >= v_st.max_groups then
    raise exception 'STATION_FULL';
  end if;

  if p_lat is not null and p_lng is not null then
    -- Distance to the station's own point, if it has one.
    if v_st.lat is not null and v_st.lng is not null then
      v_dist := 2 * 6371000 * asin(sqrt(
        power(sin(radians(p_lat - v_st.lat) / 2), 2)
        + cos(radians(v_st.lat)) * cos(radians(p_lat))
          * power(sin(radians(p_lng - v_st.lng) / 2), 2)
      ));
    end if;

    -- Distance to the whole building, if it is a known one.
    select * into v_b from public.building_geofence(v_st.area);
    if found then
      v_bdist := 2 * 6371000 * asin(sqrt(
        power(sin(radians(p_lat - v_b.lat) / 2), 2)
        + cos(radians(v_b.lat)) * cos(radians(p_lat))
          * power(sin(radians(p_lng - v_b.lng) / 2), 2)
      ));
    end if;

    if v_dist is not null or v_bdist is not null then
      v_far := not (
        (v_dist is not null
          and v_dist - v_slack <= coalesce(v_st.radius_m, 100))
        or (v_bdist is not null
          and v_bdist - v_slack <= v_b.radius_m)
      );
    end if;
  end if;

  insert into public.station_occupancy
    (group_id, station_id, checked_in_by, checked_in_at, lat, lng, accuracy_m)
  values
    (v_group, p_station_id, auth.uid(), now(), p_lat, p_lng, p_accuracy)
  on conflict (group_id) do update
    set station_id    = excluded.station_id,
        checked_in_by = excluded.checked_in_by,
        checked_in_at = excluded.checked_in_at,
        lat           = excluded.lat,
        lng           = excluded.lng,
        accuracy_m    = excluded.accuracy_m;

  insert into public.group_locations (group_id, source, station_id, reported_by)
  values (v_group, 'manual', p_station_id, auth.uid());

  perform public.fn_refresh_station(p_station_id);
  if v_prev is not null and v_prev <> p_station_id then
    perform public.fn_refresh_station(v_prev);
  end if;

  return jsonb_build_object(
    'ok', true,
    'far_away', v_far,
    'distance_m', case
      when v_bdist is not null and (v_dist is null or v_bdist < v_dist)
        then round(v_bdist)
      when v_dist is not null then round(v_dist)
      else null end
  );
end;
$$;

grant execute on function public.fn_manual_checkin(integer, double precision, double precision, double precision)
  to authenticated;
