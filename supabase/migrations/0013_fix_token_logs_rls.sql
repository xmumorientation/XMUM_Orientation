-- ═══════════════════════════════════════════════════════════════════════
-- XMUM Orientation Platform 2026 — Migration 0013
-- Fix: Enable RLS Policies, Table Grants & Replica Identity for Token Logs,
--      Puzzle Inventory, and Game Config Rules.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Enable RLS
alter table public.token_logs enable row level security;
alter table public.puzzle_inventory enable row level security;
alter table public.game_config_rules enable row level security;

-- 2. Drop existing policies if any
drop policy if exists "allow all select on token_logs" on public.token_logs;
drop policy if exists "allow all insert on token_logs" on public.token_logs;
drop policy if exists "allow all update on token_logs" on public.token_logs;
drop policy if exists "allow all delete on token_logs" on public.token_logs;

drop policy if exists "allow all select on puzzle_inventory" on public.puzzle_inventory;
drop policy if exists "allow all insert on puzzle_inventory" on public.puzzle_inventory;
drop policy if exists "allow all update on puzzle_inventory" on public.puzzle_inventory;
drop policy if exists "allow all delete on puzzle_inventory" on public.puzzle_inventory;

drop policy if exists "allow all select on game_config_rules" on public.game_config_rules;
drop policy if exists "allow all insert on game_config_rules" on public.game_config_rules;
drop policy if exists "allow all update on game_config_rules" on public.game_config_rules;
drop policy if exists "allow all delete on game_config_rules" on public.game_config_rules;

-- 3. Create permissive policies for token_logs
create policy "allow all select on token_logs"
  on public.token_logs for select
  using (true);

create policy "allow all insert on token_logs"
  on public.token_logs for insert
  with check (true);

create policy "allow all update on token_logs"
  on public.token_logs for update
  using (true)
  with check (true);

create policy "allow all delete on token_logs"
  on public.token_logs for delete
  using (true);

-- 4. Create permissive policies for puzzle_inventory
create policy "allow all select on puzzle_inventory"
  on public.puzzle_inventory for select
  using (true);

create policy "allow all insert on puzzle_inventory"
  on public.puzzle_inventory for insert
  with check (true);

create policy "allow all update on puzzle_inventory"
  on public.puzzle_inventory for update
  using (true)
  with check (true);

create policy "allow all delete on puzzle_inventory"
  on public.puzzle_inventory for delete
  using (true);

-- 5. Create permissive policies for game_config_rules
create policy "allow all select on game_config_rules"
  on public.game_config_rules for select
  using (true);

create policy "allow all insert on game_config_rules"
  on public.game_config_rules for insert
  with check (true);

create policy "allow all update on game_config_rules"
  on public.game_config_rules for update
  using (true)
  with check (true);

create policy "allow all delete on game_config_rules"
  on public.game_config_rules for delete
  using (true);

-- 6. Explicit grants to anon, authenticated, service_role
grant all on public.token_logs to anon, authenticated, service_role;
grant all on public.puzzle_inventory to anon, authenticated, service_role;
grant all on public.game_config_rules to anon, authenticated, service_role;

-- 7. Realtime Replica Identity & Publications
alter table public.token_logs replica identity full;
alter table public.puzzle_inventory replica identity full;
alter table public.groups replica identity full;
alter table public.game_config_rules replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.token_logs;
exception
  when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.puzzle_inventory;
exception
  when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.game_config_rules;
exception
  when others then null;
end $$;
