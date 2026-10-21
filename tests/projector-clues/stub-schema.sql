-- Minimal stand-in for the Supabase pieces migration 0098 depends on.

create schema if not exists auth;
create role anon nologin;
create role authenticated nologin;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create type public.user_role as enum
  ('freshie', 'faci', 'gm', 'guardian_gm', 'hof', 'hogm', 'committee', 'admin');
create type public.projector_location as enum ('B1', 'A3', 'TF');
create type public.item_type as enum ('puzzle', 'facility_card');

create table public.groups (id serial primary key, name text not null);
create table public.profiles (
  id uuid primary key,
  role public.user_role not null,
  group_id integer references public.groups (id)
);
create table public.items (
  id serial primary key,
  type public.item_type not null,
  puzzle_location public.projector_location,
  puzzle_index integer
);
create table public.inventory (
  id bigserial primary key,
  group_id integer not null references public.groups (id),
  item_id integer not null references public.items (id)
);
create table public.projectors (
  location public.projector_location primary key,
  activated_by_group integer references public.groups (id),
  activated_at timestamptz
);
create table public.game_config (key text primary key, value jsonb not null);

create function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create function public.my_group_id() returns integer
language sql stable security definer set search_path = public as $$
  select group_id from public.profiles where id = auth.uid()
$$;

alter table public.game_config enable row level security;
create policy "all read config" on public.game_config for select using (auth.uid() is not null);
grant select on public.game_config to authenticated;
