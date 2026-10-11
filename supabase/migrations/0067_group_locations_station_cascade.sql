-- Deleting a station failed with "group_locations_station_id_fkey" because groups
-- had manual check-ins there. Those check-in rows now go with the station
-- (they cannot be kept: a manual check-in must have a station).

alter table public.group_locations
  drop constraint if exists group_locations_station_id_fkey;
alter table public.group_locations
  add constraint group_locations_station_id_fkey
  foreign key (station_id) references public.stations (id) on delete cascade;
