-- Home sections: files (PDF or image) that HOF, OC, HOGM and Admin put on the
-- Home page of the roles they pick. Replaces the static Day 1 / Day 2 Action
-- Plan list (src/lib/actionPlans.ts, now gone): both plans are seeded below as
-- ordinary rows, so they can be changed or removed like any other.
--
-- Files live in the private `home-files` bucket and are shown through signed
-- URLs, so a role that is not on a section's list cannot open its file. Rows
-- seeded from public/action-plans/ keep their static path in `file_url`.
-- Needs 0113 committed first ('oc' must be a usable user_role value).

create or replace function public.is_home_editor()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.my_role() in ('hof', 'oc', 'hogm', 'admin'), false);
$$;

revoke all on function public.is_home_editor() from public, anon;
grant execute on function public.is_home_editor() to authenticated;

create table if not exists public.home_sections (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(btrim(title)) between 1 and 80),
  -- Exactly one of these: an object in the home-files bucket, or a static file
  -- served from public/ (the seeded action plans).
  storage_path text,
  file_url     text,
  file_kind    text not null check (file_kind in ('image', 'pdf')),
  roles        public.user_role[] not null check (cardinality(roles) > 0),
  sort_order   integer not null default 0,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (num_nonnulls(storage_path, file_url) = 1)
);

create or replace function public.tg_home_sections_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists home_sections_touch on public.home_sections;
create trigger home_sections_touch before update on public.home_sections
  for each row execute function public.tg_home_sections_touch();

alter table public.home_sections enable row level security;

-- A role reads the sections that list it. The four editors read every section.
drop policy if exists "read home sections" on public.home_sections;
create policy "read home sections" on public.home_sections
  for select using (
    auth.uid() is not null
    and (public.is_home_editor() or public.my_role() = any (roles))
  );

drop policy if exists "editors add home sections" on public.home_sections;
create policy "editors add home sections" on public.home_sections
  for insert with check (public.is_home_editor());

drop policy if exists "editors change home sections" on public.home_sections;
create policy "editors change home sections" on public.home_sections
  for update using (public.is_home_editor()) with check (public.is_home_editor());

drop policy if exists "editors remove home sections" on public.home_sections;
create policy "editors remove home sections" on public.home_sections
  for delete using (public.is_home_editor());

-- ── Storage ───────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'home-files', 'home-files', false, 10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "read home files" on storage.objects;
create policy "read home files" on storage.objects
  for select using (
    bucket_id = 'home-files'
    and (
      public.is_home_editor()
      or exists (
        select 1 from public.home_sections s
        where s.storage_path = storage.objects.name
          and public.my_role() = any (s.roles)
      )
    )
  );

drop policy if exists "editors add home files" on storage.objects;
create policy "editors add home files" on storage.objects
  for insert with check (bucket_id = 'home-files' and public.is_home_editor());

drop policy if exists "editors change home files" on storage.objects;
create policy "editors change home files" on storage.objects
  for update using (bucket_id = 'home-files' and public.is_home_editor());

drop policy if exists "editors remove home files" on storage.objects;
create policy "editors remove home files" on storage.objects
  for delete using (bucket_id = 'home-files' and public.is_home_editor());

-- ── The two action plans, as they were on Home ─────────────────────────────
-- Every role except Freshie. Each is added only if no section has its title.

insert into public.home_sections (title, file_url, file_kind, roles, sort_order)
select v.title, v.file_url, 'image',
       '{faci,gm,guardian_gm,hof,oc,hogm,committee,admin}'::public.user_role[], v.sort_order
from (values
  ('Day 1 Action Plan', '/action-plans/day-1.png', 0),
  ('Day 2 Action Plan', '/action-plans/day-2.png', 1)
) as v(title, file_url, sort_order)
where not exists (select 1 from public.home_sections s where s.title = v.title);
