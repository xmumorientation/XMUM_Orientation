-- ═══════════════════════════════════════════════════════════════════════
-- XMUM Orientation Platform 2026 — Schema v1
-- Migration 0001: enums, tables, constraints, profile trigger
-- Run in Supabase SQL editor (or `supabase db push`) BEFORE 0002/0003/0004.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Enums ────────────────────────────────────────────────────────────────

create type public.user_role as enum
  ('freshie', 'faci', 'gm', 'guardian_gm', 'hof', 'hogm', 'committee', 'admin');

create type public.station_status as enum ('available', 'in_progress', 'closed');

create type public.phase_state as enum ('pending', 'active', 'paused', 'ended');

create type public.location_source as enum ('gps', 'manual');

create type public.item_type as enum ('puzzle', 'facility_card');

-- Projector / puzzle-set locations (SRS §1.2: B1, A3, Track & Field)
create type public.projector_location as enum ('B1', 'A3', 'TF');

create type public.attendance_status as enum ('present', 'absent');

-- ── Groups ───────────────────────────────────────────────────────────────

create table public.groups (
  id            serial primary key,
  name          text not null unique,
  -- FR-5.5: balance can never go negative (DB-enforced, not app-only)
  token_balance integer not null default 0 check (token_balance >= 0),
  created_at    timestamptz not null default now()
);

-- ── Stations ─────────────────────────────────────────────────────────────

create table public.stations (
  id         serial primary key,
  code       text not null unique,        -- short label, e.g. "A4-1"
  name       text not null,
  area       text not null,               -- A4 / A5 / B1 / Courts ...
  status     public.station_status not null default 'closed',
  -- position on the custom SVG campus map, in percent (0-100)
  map_x      numeric(5,2) not null default 50,
  map_y      numeric(5,2) not null default 50,
  created_at timestamptz not null default now()
);

-- ── Profiles (1:1 with auth.users) ──────────────────────────────────────

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       public.user_role not null default 'freshie',
  full_name  text not null default '',
  student_id text,
  email      text,
  phone      text,
  group_id   integer references public.groups (id) on delete set null,
  station_id integer references public.stations (id) on delete set null, -- GM assignment
  created_at timestamptz not null default now()
);

create index profiles_group_idx on public.profiles (group_id);
create index profiles_role_idx on public.profiles (role);

-- Auto-create a profile row on signup. Staff imports set role via
-- app_metadata; self-registered users default to freshie.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, student_id, email, phone)
  values (
    new.id,
    coalesce((new.raw_app_meta_data ->> 'role')::public.user_role, 'freshie'),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'student_id',
    new.email,
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Projectors (the 3 victory objectives) ────────────────────────────────

create table public.projectors (
  location           public.projector_location primary key,
  name               text not null,
  map_x              numeric(5,2) not null default 50,
  map_y              numeric(5,2) not null default 50,
  -- FR-8.4: each projector activated by at most one group (PK = 1 row per
  -- location) AND each group activates at most one projector (UNIQUE below).
  activated_by_group integer references public.groups (id),
  activated_at       timestamptz,
  activated_manually boolean not null default false,
  unique (activated_by_group)
);

-- ── Token economy ────────────────────────────────────────────────────────

create table public.token_transactions (
  id              bigserial primary key,
  group_id        integer not null references public.groups (id),
  delta           integer not null check (delta <> 0),
  reason          text not null default '',
  actor           uuid references public.profiles (id),
  station_id      integer references public.stations (id),
  -- FR-5.7: duplicate submissions (double-tap / retry) apply exactly once
  idempotency_key text unique,
  reversed_by     bigint references public.token_transactions (id),
  created_at      timestamptz not null default now()
);

create index token_tx_group_idx on public.token_transactions (group_id, created_at desc);
create index token_tx_actor_idx on public.token_transactions (actor, created_at desc);

-- ── Items & inventory ────────────────────────────────────────────────────

create table public.items (
  id              serial primary key,
  type            public.item_type not null,
  name            text not null,
  description     text not null default '',
  -- puzzle pieces only:
  puzzle_location public.projector_location,
  puzzle_index    integer check (puzzle_index between 1 and 3),
  -- facility cards only: the single hidden Gala Night card (FR-7.4)
  is_gala         boolean not null default false,
  created_at      timestamptz not null default now(),
  check (
    (type = 'puzzle' and puzzle_location is not null and puzzle_index is not null)
    or (type = 'facility_card' and puzzle_location is null and puzzle_index is null)
  )
);

create unique index items_puzzle_unique
  on public.items (puzzle_location, puzzle_index)
  where type = 'puzzle';

create table public.inventory (
  id              bigserial primary key,
  group_id        integer not null references public.groups (id),
  item_id         integer not null references public.items (id),
  item_type       public.item_type not null, -- denormalised for the partial unique index
  source          text not null default 'gm_grant', -- gm_grant | gacha | admin
  granted_by      uuid references public.profiles (id),
  idempotency_key text unique,
  created_at      timestamptz not null default now()
);

-- FR-6.4: puzzle pieces non-duplicable per group
create unique index inventory_puzzle_unique
  on public.inventory (group_id, item_id)
  where item_type = 'puzzle';

create index inventory_group_idx on public.inventory (group_id, created_at desc);

-- ── Gacha ────────────────────────────────────────────────────────────────

create table public.gacha_pools (
  id          serial primary key,
  key         text not null unique,   -- idea1 | idea2_clue | idea2_resource
  name        text not null,
  description text not null default '',
  cost_tokens integer not null default 0 check (cost_tokens >= 0),
  -- bonus tokens granted with every draw from this pool (Idea 1 pays +2)
  bonus_tokens integer not null default 0 check (bonus_tokens >= 0),
  enabled     boolean not null default true,
  -- which roles may trigger this pool (SRS §2: GM=Idea 2, HOGM/HOF=Idea 1)
  allowed_roles public.user_role[] not null default '{admin}'
);

create table public.gacha_pool_entries (
  id           serial primary key,
  pool_id      integer not null references public.gacha_pools (id) on delete cascade,
  label        text not null,
  kind         text not null check (kind in ('facility_card', 'tokens', 'clue', 'nothing')),
  item_id      integer references public.items (id),
  token_amount integer not null default 0,
  weight       numeric(8,3) not null check (weight >= 0),
  -- null = unlimited; otherwise decremented per draw (Gala card qty = 1)
  remaining    integer check (remaining >= 0)
);

create index gacha_entries_pool_idx on public.gacha_pool_entries (pool_id);

create table public.gacha_draws (
  id              bigserial primary key,
  pool_id         integer not null references public.gacha_pools (id),
  entry_id        integer not null references public.gacha_pool_entries (id),
  group_id        integer not null references public.groups (id),
  actor           uuid references public.profiles (id),
  idempotency_key text unique,
  created_at      timestamptz not null default now()
);

create index gacha_draws_group_idx on public.gacha_draws (group_id, created_at desc);

-- ── Puzzle set redemption (Guardian GM verification, FR-8.x) ────────────

create table public.puzzle_redemptions (
  id          serial primary key,
  group_id    integer not null references public.groups (id),
  location    public.projector_location not null,
  redeemed_by uuid references public.profiles (id),
  nfc_note    text not null default '', -- which physical card was handed over
  redeemed_at timestamptz not null default now(),
  -- FR-8.3: a set redeems once per group+location
  unique (group_id, location)
);

-- ── NFC one-time activation tokens (FR-9.x) ─────────────────────────────

create table public.nfc_tokens (
  id            serial primary key,
  token_hash    text not null unique,  -- sha256 of the full signed token
  location      public.projector_location not null,
  label         text not null default '', -- e.g. "B1 sticker #2 (spare)"
  used_at       timestamptz,
  used_by_group integer references public.groups (id),
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now()
);

-- ── Attendance (FR-2.x) ─────────────────────────────────────────────────

create table public.attendance_sessions (
  id         serial primary key,
  name       text not null,            -- "Day 1 AM"
  starts_at  timestamptz,
  ends_at    timestamptz,
  closed     boolean not null default false, -- FR-2.4: immutable once closed
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.attendance_records (
  id         bigserial primary key,
  session_id integer not null references public.attendance_sessions (id),
  freshie_id uuid not null references public.profiles (id),
  group_id   integer not null references public.groups (id),
  status     public.attendance_status not null,
  marked_by  uuid references public.profiles (id),
  marked_at  timestamptz not null default now(),
  unique (session_id, freshie_id)
);

create index attendance_records_session_idx on public.attendance_records (session_id, group_id);

-- FR-2.2: headcount fallback per group per session
create table public.attendance_headcounts (
  id         bigserial primary key,
  session_id integer not null references public.attendance_sessions (id),
  group_id   integer not null references public.groups (id),
  headcount  integer not null check (headcount >= 0),
  marked_by  uuid references public.profiles (id),
  marked_at  timestamptz not null default now(),
  unique (session_id, group_id)
);

-- ── Location tracking (FR-3.x) ──────────────────────────────────────────

create table public.group_locations (
  id          bigserial primary key,
  group_id    integer not null references public.groups (id),
  source      public.location_source not null,
  station_id  integer references public.stations (id), -- manual check-in
  lat         double precision,                          -- gps
  lng         double precision,
  accuracy_m  double precision,
  reported_by uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  check (
    (source = 'manual' and station_id is not null)
    or (source = 'gps' and lat is not null and lng is not null)
  )
);

create index group_locations_latest_idx on public.group_locations (group_id, created_at desc);

-- ── Event phases (FR-10.x) ──────────────────────────────────────────────

create table public.phases (
  id               serial primary key,
  key              text not null unique,   -- day1 | day2 | endgame
  name             text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  state            public.phase_state not null default 'pending',
  started_at       timestamptz,
  ends_at          timestamptz,
  -- seconds left at the moment of pause, restored on resume
  paused_remaining integer,
  is_endgame       boolean not null default false,
  sort_order       integer not null default 0
);

-- ── Config / kill-switches (FR-11.5, open decisions) ────────────────────

create table public.game_config (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

-- ── Audit log (NFR-7) ───────────────────────────────────────────────────

create table public.audit_log (
  id         bigserial primary key,
  actor      uuid,
  actor_role public.user_role,
  action     text not null,
  target     text,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_actor_idx on public.audit_log (actor, created_at desc);

-- ── Realtime publication ────────────────────────────────────────────────
-- Tables clients subscribe to for live updates (FR-4.4, FR-6.3, FR-10.2).

alter publication supabase_realtime add table
  public.groups,
  public.stations,
  public.projectors,
  public.inventory,
  public.token_transactions,
  public.phases,
  public.group_locations,
  public.attendance_records,
  public.game_config;
