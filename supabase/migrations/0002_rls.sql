-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0002: Row Level Security
-- SRS §2 + NFR-4: RLS on every table; UI hiding alone is not acceptable.
-- All game MUTATIONS go through security-definer RPCs (0003) — therefore
-- most tables get SELECT policies only, and no INSERT/UPDATE for clients.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Role helpers ─────────────────────────────────────────────────────────

create or replace function public.my_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.my_group_id()
returns integer
language sql stable security definer set search_path = public
as $$
  select group_id from public.profiles where id = auth.uid();
$$;

-- Committee tier = full situational awareness (SRS §2)
create or replace function public.is_committee()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.my_role() in ('hof', 'hogm', 'committee', 'admin');
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.my_role() = 'admin';
$$;

-- ── Enable RLS everywhere ────────────────────────────────────────────────

alter table public.profiles              enable row level security;
alter table public.groups                enable row level security;
alter table public.stations              enable row level security;
alter table public.projectors            enable row level security;
alter table public.token_transactions    enable row level security;
alter table public.items                 enable row level security;
alter table public.inventory             enable row level security;
alter table public.gacha_pools           enable row level security;
alter table public.gacha_pool_entries    enable row level security;
alter table public.gacha_draws           enable row level security;
alter table public.puzzle_redemptions    enable row level security;
alter table public.nfc_tokens            enable row level security;
alter table public.attendance_sessions   enable row level security;
alter table public.attendance_records    enable row level security;
alter table public.attendance_headcounts enable row level security;
alter table public.group_locations       enable row level security;
alter table public.phases                enable row level security;
alter table public.game_config           enable row level security;
alter table public.audit_log             enable row level security;

-- ── profiles ─────────────────────────────────────────────────────────────

create policy "read own profile" on public.profiles
  for select using (id = auth.uid());

create policy "committee reads all profiles" on public.profiles
  for select using (public.is_committee());

-- Faci sees their group roster (attendance, FR-2.1)
create policy "faci reads own group members" on public.profiles
  for select using (
    public.my_role() = 'faci'
    and group_id is not null
    and group_id = public.my_group_id()
  );

create policy "update own contact fields" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

create policy "admin manages profiles" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- Column-level lockdown: without this, the "update own" policy would let a
-- user PATCH their own `role`/`group_id` and self-escalate. Direct updates
-- are limited to contact fields; role/group/station changes go through
-- security-definer RPCs (fn_admin_update_profile / fn_assign_group).
revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- ── groups ───────────────────────────────────────────────────────────────
-- Freshie/Faci see their OWN group (balance included). GMs use the
-- fn_list_groups() RPC which returns id+name only (no balances — SRS §2).

create policy "members read own group" on public.groups
  for select using (id = public.my_group_id());

create policy "committee reads all groups" on public.groups
  for select using (public.is_committee());

create policy "admin manages groups" on public.groups
  for insert with check (public.is_admin());
create policy "admin updates groups" on public.groups
  for update using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes groups" on public.groups
  for delete using (public.is_admin());

-- ── stations ─────────────────────────────────────────────────────────────
-- Map + status is visible to everyone logged in (FR-4.1/4.2).
-- Status changes go through fn_set_station_status.

create policy "all read stations" on public.stations
  for select using (auth.uid() is not null);

create policy "admin manages stations" on public.stations
  for all using (public.is_admin()) with check (public.is_admin());

-- ── projectors ───────────────────────────────────────────────────────────

create policy "all read projectors" on public.projectors
  for select using (auth.uid() is not null);

create policy "admin manages projectors" on public.projectors
  for all using (public.is_admin()) with check (public.is_admin());

-- ── token_transactions ───────────────────────────────────────────────────
-- FR-5.4: freshies see their group's full history. GMs see transactions
-- they performed (for the undo flow). Committee sees all.

create policy "group reads own transactions" on public.token_transactions
  for select using (group_id = public.my_group_id());

create policy "actor reads own transactions" on public.token_transactions
  for select using (actor = auth.uid());

create policy "committee reads all transactions" on public.token_transactions
  for select using (public.is_committee());

-- ── items ────────────────────────────────────────────────────────────────

create policy "all read items" on public.items
  for select using (auth.uid() is not null);

create policy "admin manages items" on public.items
  for all using (public.is_admin()) with check (public.is_admin());

-- ── inventory ────────────────────────────────────────────────────────────

create policy "group reads own inventory" on public.inventory
  for select using (group_id = public.my_group_id());

create policy "committee reads all inventory" on public.inventory
  for select using (public.is_committee());

-- (Guardian GMs check puzzle status via the fn_puzzle_status RPC — SRS §2
-- gives GMs no direct inventory visibility.)

-- ── gacha ────────────────────────────────────────────────────────────────
-- Weights/pool contents are staff-only; freshies only ever see results.

create policy "staff read pools" on public.gacha_pools
  for select using (public.my_role() <> 'freshie');

create policy "admin manages pools" on public.gacha_pools
  for all using (public.is_admin()) with check (public.is_admin());

create policy "elevated read pool entries" on public.gacha_pool_entries
  for select using (public.is_committee());

create policy "admin manages pool entries" on public.gacha_pool_entries
  for all using (public.is_admin()) with check (public.is_admin());

create policy "group reads own draws" on public.gacha_draws
  for select using (group_id = public.my_group_id());

create policy "committee reads all draws" on public.gacha_draws
  for select using (public.is_committee());

-- ── puzzle_redemptions ───────────────────────────────────────────────────

create policy "group reads own redemptions" on public.puzzle_redemptions
  for select using (group_id = public.my_group_id());

create policy "staff read redemptions" on public.puzzle_redemptions
  for select using (public.my_role() in ('gm', 'guardian_gm') or public.is_committee());

-- ── nfc_tokens ───────────────────────────────────────────────────────────
-- Admin console only. Activation validates via RPC, not direct reads.

create policy "admin reads nfc tokens" on public.nfc_tokens
  for select using (public.is_admin());

-- ── attendance ───────────────────────────────────────────────────────────

create policy "authenticated read sessions" on public.attendance_sessions
  for select using (auth.uid() is not null);

create policy "admin manages sessions" on public.attendance_sessions
  for all using (public.is_admin()) with check (public.is_admin());

create policy "faci reads own group attendance" on public.attendance_records
  for select using (
    public.my_role() = 'faci' and group_id = public.my_group_id()
  );

create policy "freshie reads own attendance" on public.attendance_records
  for select using (freshie_id = auth.uid());

create policy "committee reads all attendance" on public.attendance_records
  for select using (public.is_committee());

create policy "faci reads own group headcounts" on public.attendance_headcounts
  for select using (
    public.my_role() = 'faci' and group_id = public.my_group_id()
  );

create policy "committee reads all headcounts" on public.attendance_headcounts
  for select using (public.is_committee());

-- ── group_locations ──────────────────────────────────────────────────────
-- OPEN DECISION D-1 resolved: Faci sees OWN group only. Committee sees all.

create policy "faci reads own group location" on public.group_locations
  for select using (group_id = public.my_group_id());

create policy "committee reads all locations" on public.group_locations
  for select using (public.is_committee());

-- ── phases / config ──────────────────────────────────────────────────────

create policy "all read phases" on public.phases
  for select using (auth.uid() is not null);

create policy "admin manages phases" on public.phases
  for all using (public.is_admin()) with check (public.is_admin());

-- Kill-switch states must be readable so clients can grey out disabled
-- features immediately (server still re-checks in every RPC).
create policy "all read config" on public.game_config
  for select using (auth.uid() is not null);

-- ── audit_log ────────────────────────────────────────────────────────────
-- SRS §2: HOF/HOGM read; Admin full.

create policy "leads read audit log" on public.audit_log
  for select using (public.my_role() in ('hof', 'hogm', 'admin'));
