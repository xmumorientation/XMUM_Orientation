-- ═══════════════════════════════════════════════════════════════════════
-- XMUM Orientation Platform 2026 — Migration 0013
-- 1. Configure exactly 10 Groups and safely drop group_number NOT NULL constraint.
-- 2. Enable RLS Policies, Table Grants & Replica Identity for Token Logs,
--    Puzzle Inventory, and Game Config Rules.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Groups (Ensure exactly 10 Groups & Fix group_number Constraint) ──

do $$
declare
  has_group_num boolean;
  i integer;
begin
  -- 1. Ensure columns exist
  alter table public.groups
    add column if not exists group_id integer,
    add column if not exists group_name text,
    add column if not exists current_tokens integer not null default 0;

  -- 2. Drop NOT NULL constraint on group_number to prevent constraint errors
  select exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'groups' and column_name = 'group_number'
  ) into has_group_num;

  if has_group_num then
    alter table public.groups alter column group_number drop not null;
    execute 'update public.groups set group_number = coalesce(group_number, id) where group_number is null';
  else
    alter table public.groups add column if not exists group_number integer;
  end if;

  -- 3. Sync existing groups
  update public.groups
  set group_id = coalesce(group_id, id),
      group_name = coalesce(group_name, name),
      current_tokens = coalesce(current_tokens, token_balance, 0)
  where group_id is null or group_name is null;

  -- 4. Seed Groups 1 through 10
  for i in 1..10 loop
    if not exists (select 1 from public.groups where id = i or group_id = i or name = 'Group ' || i) then
      insert into public.groups (id, name, token_balance, group_id, group_name, group_number, current_tokens)
      values (i, 'Group ' || i, 0, i, 'Group ' || i, i, 0)
      on conflict (id) do update
      set group_id = excluded.group_id,
          group_name = excluded.group_name,
          group_number = excluded.group_number;
    else
      update public.groups
      set group_id = coalesce(group_id, id),
          group_name = coalesce(group_name, name),
          group_number = coalesce(group_number, id)
      where id = i or group_id = i or name = 'Group ' || i;
    end if;
  end loop;

  -- Remove unused groups > 10 (if no members assigned)
  delete from public.groups 
  where id > 10 
    and not exists (select 1 from public.profiles where group_id = public.groups.id);

end $$;

-- ── 2. Enable RLS ──────────────────────────────────────────────────────────

alter table public.token_logs enable row level security;
alter table public.puzzle_inventory enable row level security;
alter table public.game_config_rules enable row level security;

-- ── 3. Drop existing policies if any ───────────────────────────────────────

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

-- ── 4. Permissive policies for token_logs ──────────────────────────────────

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

-- ── 5. Permissive policies for puzzle_inventory ────────────────────────────

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

-- ── 6. Permissive policies for game_config_rules ───────────────────────────

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

-- ── 7. Explicit Grants ─────────────────────────────────────────────────────

grant all on public.token_logs to anon, authenticated, service_role;
grant all on public.puzzle_inventory to anon, authenticated, service_role;
grant all on public.game_config_rules to anon, authenticated, service_role;

-- ── 8. Realtime Replica Identity & Publications ────────────────────────────

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
