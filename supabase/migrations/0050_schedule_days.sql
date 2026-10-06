-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0050: one date per schedule day
--
-- Admin sets "Day 1" = 28 Nov once; it applies to every schedule item whose
-- day is "Day 1". Changing the date moves all that day's planned times to
-- the new date (same clock times). A date is kept even before any item has
-- a start time. Times are the event's local time (Asia/Kuala_Lumpur).
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.schedule_days (
  day_label  text primary key,
  day_date   date not null,
  updated_at timestamptz not null default now()
);

alter table public.schedule_days enable row level security;

drop policy if exists "anyone reads schedule days" on public.schedule_days;
create policy "anyone reads schedule days" on public.schedule_days
  for select to anon, authenticated using (true);

drop policy if exists "admin manages schedule days" on public.schedule_days;
create policy "admin manages schedule days" on public.schedule_days
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.schedule_days to anon, authenticated;
grant insert, update, delete on public.schedule_days to authenticated;

-- Keep the dates already used by items.
insert into public.schedule_days (day_label, day_date)
select day_label, min((starts_at at time zone 'Asia/Kuala_Lumpur')::date)
  from public.schedule_items
 where starts_at is not null
 group by day_label
on conflict (day_label) do nothing;

-- Put a timestamp on the given day, keeping its local clock time.
create or replace function public.fn_on_day(p_ts timestamptz, p_day date)
returns timestamptz
language sql immutable
as $$
  select case when p_ts is null then null
    else ((p_day + (p_ts at time zone 'Asia/Kuala_Lumpur')::time) at time zone 'Asia/Kuala_Lumpur') end;
$$;

-- The day's date changed: move every item of that day.
create or replace function public.trg_schedule_day_date()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.schedule_items
     set starts_at = public.fn_on_day(starts_at, new.day_date),
         ends_at   = public.fn_on_day(ends_at, new.day_date)
   where day_label = new.day_label
     and (starts_at is not null or ends_at is not null);
  return new;
end;
$$;

drop trigger if exists schedule_day_date on public.schedule_days;
create trigger schedule_day_date
  after insert or update of day_date on public.schedule_days
  for each row execute function public.trg_schedule_day_date();

-- An item saved (or moved to another day) always sits on its day's date.
create or replace function public.trg_schedule_item_on_day()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_day date;
begin
  select day_date into v_day from public.schedule_days where day_label = new.day_label;
  if found then
    new.starts_at := public.fn_on_day(new.starts_at, v_day);
    new.ends_at := public.fn_on_day(new.ends_at, v_day);
  end if;
  return new;
end;
$$;

drop trigger if exists schedule_item_on_day on public.schedule_items;
create trigger schedule_item_on_day
  before insert or update of day_label, starts_at, ends_at on public.schedule_items
  for each row execute function public.trg_schedule_item_on_day();

do $$ begin alter publication supabase_realtime add table public.schedule_days; exception when others then null; end $$;
