-- Remove the seeded stations (A4-1, CRT-1, and the rest).
-- Admins add stations again, each one on A1–A5, B1, or Track & Field,
-- with a game or purpose they can rename later.

alter table public.stations
  add column if not exists purpose text not null default '';

-- Manual check-ins cannot keep a null station_id, so those rows go with the stations.
delete from public.group_locations where station_id is not null;

update public.profiles
   set station_id = null
 where station_id is not null;

update public.token_transactions
   set station_id = null
 where station_id is not null;

do $$
begin
  if to_regclass('public.token_logs') is not null then
    execute 'update public.token_logs set station_id = null where station_id is not null';
  end if;
  if to_regclass('public.puzzle_inventory') is not null then
    execute 'update public.puzzle_inventory set station_id = null where station_id is not null';
  end if;
  if to_regclass('public.gm_station_assignments') is not null then
    execute 'delete from public.gm_station_assignments';
  end if;
end $$;

delete from public.stations;

-- Games and purposes the admin can add and rename. Stations store the name
-- in `purpose` so the map can read one table.
create table if not exists public.station_purposes (
  id         serial primary key,
  name       text not null unique check (char_length(btrim(name)) > 0),
  created_at timestamptz not null default now()
);

alter table public.station_purposes enable row level security;

drop policy if exists "all read station purposes" on public.station_purposes;
create policy "all read station purposes" on public.station_purposes
  for select using (auth.uid() is not null);

drop policy if exists "admin manages station purposes" on public.station_purposes;
create policy "admin manages station purposes" on public.station_purposes
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.station_purposes to authenticated;
grant usage, select on sequence public.station_purposes_id_seq to authenticated;

alter table public.stations drop constraint if exists stations_area_building;
alter table public.stations
  add constraint stations_area_building
  check (area in ('A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'Track & Field'));
