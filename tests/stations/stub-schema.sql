-- Minimal stand-in for the Supabase pieces the station migrations depend on.
-- Real migrations 0062, 0064 and 0078 (and the 0049 phase trigger) are applied on top.

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
create type public.station_status as enum ('available', 'in_progress', 'closed');
create type public.location_source as enum ('gps', 'manual');

create table public.groups (
  id serial primary key,
  name text not null unique,
  token_balance integer not null default 0
);

create table public.stations (
  id serial primary key,
  code text not null,
  name text not null,
  area text not null default 'A1',
  day integer not null default 1,
  status public.station_status not null default 'closed'
);

create table public.profiles (
  id uuid primary key,
  role public.user_role not null,
  full_name text,
  group_id integer references public.groups (id),
  station_id integer references public.stations (id)
);

create table public.group_locations (
  id bigserial primary key,
  group_id integer not null references public.groups (id),
  source public.location_source not null,
  station_id integer references public.stations (id),
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  reported_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.phases (
  key text primary key,
  state text not null default 'pending'
);

create table public.audit_log (
  id bigserial primary key,
  actor uuid, actor_role public.user_role, action text, target text, detail jsonb
);

create function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create function public.my_group_id() returns integer
language sql stable security definer set search_path = public as $$
  select group_id from public.profiles where id = auth.uid()
$$;
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'admin'
$$;
create function public.is_committee() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() in ('hof', 'hogm', 'committee', 'admin')
$$;
create function public.audit(p_action text, p_target text, p_detail jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.audit_log (actor, actor_role, action, target, detail)
  values (auth.uid(), public.my_role(), p_action, p_target, coalesce(p_detail, '{}'::jsonb))
$$;

alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
