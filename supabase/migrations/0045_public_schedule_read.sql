-- The public Welcome page shows the timetable from schedule_items, and its
-- visitors are not logged in. Let anyone read the schedule. Only Admin can
-- still add, change or delete entries ("admin manages schedule" in 0005).

drop policy if exists "all read schedule" on public.schedule_items;
create policy "anyone reads schedule" on public.schedule_items
  for select to anon, authenticated using (true);

grant select on public.schedule_items to anon, authenticated;

-- Live updates on the Welcome page and Freshie Schedule after an Admin edit.
do $$ begin alter publication supabase_realtime add table public.schedule_items; exception when others then null; end $$;
