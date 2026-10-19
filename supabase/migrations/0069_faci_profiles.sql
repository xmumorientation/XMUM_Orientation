-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0069: Faci profiles backend (ROADMAP item 7)
--   A. faci_profiles table (photo, Instagram, programme, languages, intro)
--   B. RLS: select only; all writes go through fn_set_my_faci_profile
--   C. fn_set_my_faci_profile, fn_group_facis, fn_admin_clear_faci_profile
--   D. faci-avatars storage bucket (public read, a Faci writes own folder)
--   E. realtime
-- No WhatsApp or phone number is stored here (decision 2026-10-13).
-- Run this BEFORE deploying the frontend that calls fn_group_facis().
-- ═══════════════════════════════════════════════════════════════════════

-- ── A. Table ─────────────────────────────────────────────────────────────

create table if not exists public.faci_profiles (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  instagram   text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  programme   text check (programme is null or char_length(programme) <= 80),
  languages   text[] not null default '{}'
              check (cardinality(languages) <= 6),
  intro       text check (intro is null or char_length(intro) <= 160),
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 200),
  updated_at  timestamptz not null default now()
);

-- ── B. RLS (select only) ─────────────────────────────────────────────────

alter table public.faci_profiles enable row level security;

drop policy if exists "faci_profiles select" on public.faci_profiles;
create policy "faci_profiles select" on public.faci_profiles
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_committee()
    or (
      public.my_role() = 'faci'
      and public.my_group_id() is not null
      and public.my_group_id() = (
        select p.group_id from public.profiles p where p.id = faci_profiles.user_id
      )
    )
  );

revoke all on public.faci_profiles from public, anon, authenticated;
grant select on public.faci_profiles to authenticated;

-- ── C. Functions ─────────────────────────────────────────────────────────

create or replace function public.fn_set_my_faci_profile(
  p_instagram   text,
  p_programme   text,
  p_languages   text[],
  p_intro       text,
  p_avatar_path text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_ig    text := nullif(btrim(coalesce(p_instagram, ''), ' @'), '');
  v_prog  text := nullif(btrim(coalesce(p_programme, '')), '');
  v_intro text := nullif(btrim(coalesce(p_intro, '')), '');
  v_langs text[] := coalesce(p_languages, '{}');
  v_path  text := nullif(btrim(coalesce(p_avatar_path, '')), '');
begin
  if public.my_role() is distinct from 'faci' then
    raise exception 'FORBIDDEN';
  end if;
  if v_ig is not null and v_ig !~ '^[A-Za-z0-9._]{1,30}$' then
    raise exception 'INVALID_INSTAGRAM';
  end if;
  if v_prog is not null and char_length(v_prog) > 80 then
    raise exception 'INVALID_PROGRAMME';
  end if;
  if v_intro is not null and char_length(v_intro) > 160 then
    raise exception 'INVALID_INTRO';
  end if;
  if cardinality(v_langs) > 6 then
    raise exception 'TOO_MANY_LANGUAGES';
  end if;
  -- an avatar must live in the caller's own folder
  if v_path is not null and split_part(v_path, '/', 1) <> auth.uid()::text then
    raise exception 'INVALID_AVATAR_PATH';
  end if;

  insert into public.faci_profiles
    (user_id, instagram, programme, languages, intro, avatar_path, updated_at)
  values
    (auth.uid(), v_ig, v_prog, v_langs, v_intro, v_path, now())
  on conflict (user_id) do update set
    instagram   = excluded.instagram,
    programme   = excluded.programme,
    languages   = excluded.languages,
    intro       = excluded.intro,
    avatar_path = excluded.avatar_path,
    updated_at  = now();

  perform public.audit('faci_profile.set', auth.uid()::text, '{}'::jsonb);
end;
$$;

-- avatar_url is a path relative to the Supabase project URL; the frontend
-- prefixes NEXT_PUBLIC_SUPABASE_URL.
create or replace function public.fn_group_facis()
returns table (
  id          uuid,
  full_name   text,
  instagram   text,
  programme   text,
  languages   text[],
  intro       text,
  avatar_url  text
)
language sql stable security definer set search_path = public
as $$
  select p.id,
         p.full_name,
         fp.instagram,
         fp.programme,
         coalesce(fp.languages, '{}'::text[]),
         fp.intro,
         case when fp.avatar_path is null then null
              else '/storage/v1/object/public/faci-avatars/' || fp.avatar_path
         end
    from public.profiles p
    left join public.faci_profiles fp on fp.user_id = p.id
   where public.my_role() in ('freshie', 'faci')
     and public.my_group_id() is not null
     and p.role = 'faci'
     and p.group_id = public.my_group_id()
   order by p.full_name;
$$;

create or replace function public.fn_admin_clear_faci_profile(
  p_user_id uuid,
  p_fields  text[]
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_fields, '{}')) f
     where f not in ('avatar_path', 'intro')
  ) then
    raise exception 'INVALID_FIELD';
  end if;

  update public.faci_profiles
     set avatar_path = case when 'avatar_path' = any(p_fields) then null else avatar_path end,
         intro       = case when 'intro'       = any(p_fields) then null else intro end,
         updated_at  = now()
   where user_id = p_user_id;

  perform public.audit('faci_profile.clear', p_user_id::text,
                       jsonb_build_object('fields', to_jsonb(p_fields)));
end;
$$;

revoke all on function public.fn_set_my_faci_profile(text, text, text[], text, text) from public, anon;
revoke all on function public.fn_group_facis() from public, anon;
revoke all on function public.fn_admin_clear_faci_profile(uuid, text[]) from public, anon;
grant execute on function public.fn_set_my_faci_profile(text, text, text[], text, text) to authenticated;
grant execute on function public.fn_group_facis() to authenticated;
grant execute on function public.fn_admin_clear_faci_profile(uuid, text[]) to authenticated;

-- ── D. Storage bucket ────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('faci-avatars', 'faci-avatars', true, 1048576,
        array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read faci avatars" on storage.objects;
create policy "public read faci avatars" on storage.objects
  for select using (bucket_id = 'faci-avatars');

drop policy if exists "faci writes own avatar" on storage.objects;
create policy "faci writes own avatar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'faci-avatars'
    and public.my_role() = 'faci'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "faci updates own avatar" on storage.objects;
create policy "faci updates own avatar" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'faci-avatars'
    and public.my_role() = 'faci'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'faci-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "faci deletes own avatar" on storage.objects;
create policy "faci deletes own avatar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'faci-avatars'
    and public.my_role() = 'faci'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── E. Realtime ──────────────────────────────────────────────────────────

do $$ begin alter publication supabase_realtime add table public.faci_profiles; exception when others then null; end $$;
