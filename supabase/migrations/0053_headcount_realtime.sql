-- Admin → Headcount follows Faci headcounts and newly opened sessions live.
do $$ begin alter publication supabase_realtime add table public.attendance_headcounts; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.attendance_sessions; exception when others then null; end $$;
