-- Day 2 operations: Hard opens at 45 minutes, and every game station has
-- capacity for exactly one group. Do not overwrite an Admin-customised plan.

do $$
begin
  if to_regclass('public.day2_schedule') is not null then
    update public.day2_schedule
    set segments = jsonb_set(segments, '{1,start_min}', '45'::jsonb)
    where segments = '[
      {"id":"s1","label":"Opening","start_min":0,"easy":true,"medium":true,"hard":false,"blindbox":true,"funfair":false},
      {"id":"s2","label":"Hard Stations Open","start_min":60,"easy":true,"medium":true,"hard":true,"blindbox":true,"funfair":false},
      {"id":"s3","label":"Funfair","start_min":105,"easy":true,"medium":true,"hard":true,"blindbox":true,"funfair":true}
    ]'::jsonb;
  end if;

  -- 0062 is present in production. Keeping this guarded also lets the Day 2
  -- schedule migration run in isolated test schemas created before 0062.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'stations' and column_name = 'max_groups'
  ) then
    update public.stations
    set max_groups = 1
    where day = 2
      and max_groups is distinct from 1;

    alter table public.stations
      drop constraint if exists stations_day2_one_group;

    alter table public.stations
      add constraint stations_day2_one_group
      check (day <> 2 or max_groups = 1);
  end if;
end $$;
