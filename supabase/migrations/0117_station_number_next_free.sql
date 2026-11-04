-- Adding a station failed with: duplicate key value violates unique
-- constraint "stations_number_day_unique".
--
-- 0061 filled station_number from the trailing number of the code (A1-2 -> 2),
-- and 1 when there is none. So any floor that is not a number ("A1-ny"), or two
-- blocks with the same floor ("A1-1" and "A2-1"), gave a number already taken
-- that day. station_number only has to be unique per day (the seeds already
-- number from max + 1), so a station that arrives without one now gets the next
-- free number for its day. An explicit station_number is still kept as sent.

create or replace function public.stations_fill_station_number()
returns trigger
language plpgsql
as $$
begin
  if new.station_number is null then
    select coalesce(max(s.station_number), 0) + 1
      into new.station_number
      from public.stations s
     where s.day = new.day;
  end if;
  if new.station_name is null then
    new.station_name := new.name;
  end if;
  return new;
end;
$$;
