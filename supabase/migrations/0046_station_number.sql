-- The live stations table requires station_number, which the app does not
-- always send. Fill it from the generated code (TF-1 -> 1) on insert.

create or replace function public.stations_fill_station_number()
returns trigger
language plpgsql
as $$
begin
  if new.station_number is null then
    new.station_number := coalesce(
      nullif(substring(new.code from '-([0-9]+)$'), '')::integer,
      1
    );
  end if;
  if new.station_name is null then
    new.station_name := new.name;
  end if;
  return new;
end;
$$;

drop trigger if exists stations_fill_station_number on public.stations;
create trigger stations_fill_station_number
  before insert on public.stations
  for each row
  execute function public.stations_fill_station_number();
