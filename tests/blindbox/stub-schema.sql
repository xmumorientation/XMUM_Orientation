-- Minimal stand-in for the Supabase pieces the blind-box migrations depend on.
-- The real migrations 0054 (rebuild) and 0070 (buy flow) are applied on top.

create schema if not exists auth;
create role anon nologin;
create role authenticated nologin;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;

-- auth.uid() reads the user id the test sets for the current transaction
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create type public.user_role as enum
  ('freshie', 'faci', 'gm', 'guardian_gm', 'hof', 'hogm', 'committee', 'admin');

create table public.groups (
  id serial primary key,
  name text not null unique,
  display_name text,
  token_balance integer not null default 0 check (token_balance >= 0)
);

create table public.stations (
  id serial primary key,
  code text not null unique,
  name text not null
);

create table public.profiles (
  id uuid primary key,
  role public.user_role not null,
  full_name text,
  group_id integer references public.groups (id),
  station_id integer references public.stations (id)
);

create table public.token_transactions (
  id bigserial primary key,
  group_id integer not null references public.groups (id),
  delta integer not null check (delta <> 0),
  reason text,
  actor uuid,
  station_id integer,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create table public.game_config (key text primary key, value jsonb not null);

create table public.audit_log (
  id bigserial primary key,
  actor uuid, actor_role public.user_role, action text, target text, detail jsonb
);

-- tables fn_live_ops (0054) reads; never queried by these tests
create table public.inventory (item_type text);
create table public.puzzle_redemptions (id int);
create table public.projectors (activated_at timestamptz);

-- the old v2 blind-box tables 0054 drops (its guard counts their rows)
create table public.blind_box_claims (id serial primary key);
create table public.blind_box_sales (id serial primary key);
create table public.blind_box_allocations (id serial primary key);
create function public.fn_scan_blind_box(text) returns void language sql as $$ select $$;
create function public.fn_sell_blind_box(integer, text) returns void language sql as $$ select $$;

create publication supabase_realtime;

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
create function public.config_bool(p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::boolean from public.game_config where key = p_key), p_default)
$$;
create function public.audit(p_action text, p_target text, p_detail jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.audit_log (actor, actor_role, action, target, detail)
  values (auth.uid(), public.my_role(), p_action, p_target, coalesce(p_detail, '{}'::jsonb))
$$;

-- Supabase default privileges: tables are open to the API roles and gated by
-- RLS; functions are executable by everyone until a migration revokes them.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
