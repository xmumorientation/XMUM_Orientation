-- ═══════════════════════════════════════════════════════════════════════
-- XMUM Orientation Platform 2026 — Migration 0012
-- Group-Centric Token Economy, Scoreboard, Game Rules, and Consoles
-- Strictly keyed by group_id (1 to 12) without requiring user_id.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Groups (Ensure 12 Groups with group_id, group_number, and current_tokens) ────

do $$
declare
  has_group_num boolean;
  has_group_name boolean;
  i integer;
begin
  -- Add compatibility columns if missing
  alter table public.groups
    add column if not exists group_id integer,
    add column if not exists group_name text,
    add column if not exists current_tokens integer not null default 0;

  -- Check if group_number column exists in public.groups
  select exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'groups' and column_name = 'group_number'
  ) into has_group_num;

  if has_group_num then
    execute 'update public.groups set group_number = coalesce(group_number, id) where group_number is null';
  end if;

  -- Sync existing groups
  update public.groups
  set group_id = coalesce(group_id, id),
      group_name = coalesce(group_name, name),
      current_tokens = coalesce(current_tokens, token_balance, 0)
  where group_id is null or group_name is null;

  -- Seed Groups 1 through 12 if missing
  for i in 1..12 loop
    if not exists (select 1 from public.groups where id = i or group_id = i or name = 'Group ' || i) then
      if has_group_num then
        execute format(
          'insert into public.groups (id, name, token_balance, group_id, group_name, group_number, current_tokens) values (%s, %L, 0, %s, %L, %s, 0) on conflict do nothing',
          i, 'Group ' || i, i, 'Group ' || i, i
        );
      else
        insert into public.groups (id, name, token_balance, group_id, group_name, current_tokens)
        values (i, 'Group ' || i, 0, i, 'Group ' || i, 0)
        on conflict do nothing;
      end if;
    else
      if has_group_num then
        execute format(
          'update public.groups set group_id = coalesce(group_id, id), group_name = coalesce(group_name, name), group_number = coalesce(group_number, id) where id = %s or group_id = %s or name = %L',
          i, i, 'Group ' || i
        );
      else
        update public.groups
        set group_id = coalesce(group_id, id),
            group_name = coalesce(group_name, name)
        where id = i or group_id = i or name = 'Group ' || i;
      end if;
    end if;
  end loop;
end $$;

-- ── 2. Stations (Ensure station_id, day, station_name, difficulty, token_cost) ──

-- Difficulty enum / text check
do $$
begin
  create type public.game_difficulty as enum ('NONE', 'EASY', 'MEDIUM', 'HARD');
exception
  when duplicate_object then null;
end $$;

alter table public.stations
  add column if not exists station_id integer,
  add column if not exists day integer not null default 1,
  add column if not exists station_name text,
  add column if not exists difficulty text not null default 'NONE',
  add column if not exists token_cost integer not null default 0;

update public.stations
set station_id = id,
    station_name = coalesce(station_name, name)
where station_id is null or station_name is null;

-- ── 3. Game Config Rules ───────────────────────────────────────────────

create table if not exists public.game_config_rules (
  rule_id    serial primary key,
  day        integer not null default 1,
  rule_key   varchar(100) not null unique,
  rule_value integer not null default 0,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed default game config rules
insert into public.game_config_rules (day, rule_key, rule_value, description)
values
  (1, 'DAY1_WIN_TOKENS', 2, 'Tokens awarded to winning group in Day 1 game'),
  (1, 'DAY1_LOSE_TOKENS', 1, 'Tokens awarded to losing group in Day 1 game'),
  (2, 'EASY_COST', 2, 'Token entry fee for Easy difficulty station on Day 2'),
  (2, 'MEDIUM_COST', 4, 'Token entry fee for Medium difficulty station on Day 2'),
  (2, 'HARD_COST', 6, 'Token entry fee for Hard difficulty station on Day 2')
on conflict (rule_key) do update
set rule_value = excluded.rule_value,
    description = excluded.description;

-- ── 4. Token Logs (Strictly Group-Centric) ─────────────────────────────

create table if not exists public.token_logs (
  log_id            uuid primary key default gen_random_uuid(),
  group_id          integer not null references public.groups (id) on delete cascade,
  amount            integer not null,
  transaction_type  varchar(50) not null check (
    transaction_type in ('DAY1_GAME', 'DAY2_ENTRY', 'MANUAL_GM_ADJUST', 'MANUAL_ADMIN_ADJUST', 'SYSTEM_RESET')
  ),
  station_id        integer references public.stations (id) on delete set null,
  notes             text,
  created_at        timestamptz not null default now()
);

create index if not exists token_logs_group_idx on public.token_logs (group_id);
create index if not exists token_logs_created_at_idx on public.token_logs (created_at desc);

-- ── 5. Puzzle Inventory (Strictly Group-Centric) ────────────────────────

create table if not exists public.puzzle_inventory (
  inventory_id serial primary key,
  group_id     integer not null references public.groups (id) on delete cascade,
  location_id  integer not null check (location_id in (1, 2, 3)),
  piece_id     varchar(50) not null,
  station_id   integer references public.stations (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists puzzle_inventory_group_idx on public.puzzle_inventory (group_id);
create index if not exists puzzle_inventory_location_idx on public.puzzle_inventory (group_id, location_id);

-- ── 6. Atomic Stored Functions / RPCs ───────────────────────────────────

-- Day 1 Result Recorder (Single group or PK mode)
create or replace function public.fn_day1_record_result(
  p_win_group_id  integer default null,
  p_lose_group_id integer default null,
  p_station_id    integer default null,
  p_notes         text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_win_tokens  integer := 2;
  v_lose_tokens integer := 1;
  v_result      jsonb;
begin
  -- Fetch dynamic rules
  select coalesce(rule_value, 2) into v_win_tokens
  from public.game_config_rules
  where rule_key = 'DAY1_WIN_TOKENS';

  select coalesce(rule_value, 1) into v_lose_tokens
  from public.game_config_rules
  where rule_key = 'DAY1_LOSE_TOKENS';

  if p_win_group_id is null and p_lose_group_id is null then
    raise exception 'At least one group must be specified.';
  end if;

  if p_win_group_id is not null and p_lose_group_id is not null and p_win_group_id = p_lose_group_id then
    raise exception 'WIN group and LOSE group cannot be identical.';
  end if;

  -- Process WIN group
  if p_win_group_id is not null then
    update public.groups
    set current_tokens = current_tokens + v_win_tokens,
        token_balance  = token_balance + v_win_tokens
    where id = p_win_group_id or group_id = p_win_group_id;

    insert into public.token_logs (group_id, amount, transaction_type, station_id, notes)
    values (
      p_win_group_id,
      v_win_tokens,
      'DAY1_GAME',
      p_station_id,
      coalesce(p_notes, 'Day 1 Station Victory')
    );
  end if;

  -- Process LOSE group
  if p_lose_group_id is not null then
    update public.groups
    set current_tokens = current_tokens + v_lose_tokens,
        token_balance  = token_balance + v_lose_tokens
    where id = p_lose_group_id or group_id = p_lose_group_id;

    insert into public.token_logs (group_id, amount, transaction_type, station_id, notes)
    values (
      p_lose_group_id,
      v_lose_tokens,
      'DAY1_GAME',
      p_station_id,
      coalesce(p_notes, 'Day 1 Station Participation')
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'win_group_id', p_win_group_id,
    'win_tokens', case when p_win_group_id is not null then v_win_tokens else 0 end,
    'lose_group_id', p_lose_group_id,
    'lose_tokens', case when p_lose_group_id is not null then v_lose_tokens else 0 end
  );
end;
$$;

-- Day 2 Token Check & Deduction
create or replace function public.fn_day2_deduct_entry(
  p_group_id   integer,
  p_token_cost integer,
  p_station_id integer default null,
  p_notes      text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_current_tokens integer;
begin
  select coalesce(current_tokens, token_balance, 0)
  into v_current_tokens
  from public.groups
  where id = p_group_id or group_id = p_group_id
  for update;

  if v_current_tokens is null then
    raise exception 'Group % not found.', p_group_id;
  end if;

  if v_current_tokens < p_token_cost then
    return jsonb_build_object(
      'ok', false,
      'error', 'Insufficient tokens to play this station.',
      'current_tokens', v_current_tokens,
      'required_tokens', p_token_cost
    );
  end if;

  update public.groups
  set current_tokens = current_tokens - p_token_cost,
      token_balance  = token_balance - p_token_cost
  where id = p_group_id or group_id = p_group_id;

  insert into public.token_logs (group_id, amount, transaction_type, station_id, notes)
  values (
    p_group_id,
    -p_token_cost,
    'DAY2_ENTRY',
    p_station_id,
    coalesce(p_notes, 'Day 2 Station Entry Fee')
  );

  return jsonb_build_object(
    'ok', true,
    'group_id', p_group_id,
    'deducted', p_token_cost,
    'remaining_tokens', v_current_tokens - p_token_cost
  );
end;
$$;

-- Day 2 Award Puzzle Piece
create or replace function public.fn_day2_award_piece(
  p_group_id    integer,
  p_location_id integer,
  p_piece_id    varchar(50),
  p_station_id  integer default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_new_inv_id integer;
begin
  insert into public.puzzle_inventory (group_id, location_id, piece_id, station_id)
  values (p_group_id, p_location_id, p_piece_id, p_station_id)
  returning inventory_id into v_new_inv_id;

  return jsonb_build_object(
    'ok', true,
    'inventory_id', v_new_inv_id,
    'group_id', p_group_id,
    'location_id', p_location_id,
    'piece_id', p_piece_id
  );
end;
$$;

-- Manual Token Adjustment (Admin / GM Override)
create or replace function public.fn_manual_token_adjust(
  p_group_id         integer,
  p_amount           integer,
  p_transaction_type varchar(50) default 'MANUAL_ADMIN_ADJUST',
  p_notes            text default 'Manual adjustment'
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_current_tokens integer;
  v_new_balance    integer;
begin
  if p_notes is null or trim(p_notes) = '' then
    raise exception 'Notes field is mandatory for manual token adjustments.';
  end if;

  select coalesce(current_tokens, token_balance, 0)
  into v_current_tokens
  from public.groups
  where id = p_group_id or group_id = p_group_id
  for update;

  if v_current_tokens is null then
    raise exception 'Group % not found.', p_group_id;
  end if;

  v_new_balance := v_current_tokens + p_amount;
  if v_new_balance < 0 then
    v_new_balance := 0;
  end if;

  update public.groups
  set current_tokens = v_new_balance,
      token_balance  = v_new_balance
  where id = p_group_id or group_id = p_group_id;

  insert into public.token_logs (group_id, amount, transaction_type, notes)
  values (
    p_group_id,
    p_amount,
    p_transaction_type,
    p_notes
  );

  return jsonb_build_object(
    'ok', true,
    'group_id', p_group_id,
    'amount', p_amount,
    'new_tokens', v_new_balance
  );
end;
$$;

-- Update Game Config Rule
create or replace function public.fn_update_game_config_rule(
  p_rule_key   varchar(100),
  p_rule_value integer
)
returns jsonb
language plpgsql
security definer
as $$
begin
  insert into public.game_config_rules (rule_key, rule_value, updated_at)
  values (p_rule_key, p_rule_value, now())
  on conflict (rule_key) do update
  set rule_value = excluded.rule_value,
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'rule_key', p_rule_key,
    'rule_value', p_rule_value
  );
end;
$$;

-- ── 7. RLS & Permissions ─────────────────────────────────────────────

alter table public.token_logs enable row level security;
alter table public.puzzle_inventory enable row level security;
alter table public.game_config_rules enable row level security;

-- Permissive policies for token_logs
drop policy if exists "allow all select on token_logs" on public.token_logs;
drop policy if exists "allow all insert on token_logs" on public.token_logs;
drop policy if exists "allow all update on token_logs" on public.token_logs;
drop policy if exists "allow all delete on token_logs" on public.token_logs;

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

-- Permissive policies for puzzle_inventory
drop policy if exists "allow all select on puzzle_inventory" on public.puzzle_inventory;
drop policy if exists "allow all insert on puzzle_inventory" on public.puzzle_inventory;
drop policy if exists "allow all update on puzzle_inventory" on public.puzzle_inventory;
drop policy if exists "allow all delete on puzzle_inventory" on public.puzzle_inventory;

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

-- Permissive policies for game_config_rules
drop policy if exists "allow all select on game_config_rules" on public.game_config_rules;
drop policy if exists "allow all insert on game_config_rules" on public.game_config_rules;
drop policy if exists "allow all update on game_config_rules" on public.game_config_rules;
drop policy if exists "allow all delete on game_config_rules" on public.game_config_rules;

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

-- Explicit grants to anon, authenticated, service_role
grant all on public.token_logs to anon, authenticated, service_role;
grant all on public.puzzle_inventory to anon, authenticated, service_role;
grant all on public.game_config_rules to anon, authenticated, service_role;

-- ── 8. Realtime Enablement & Replica Identity ───────────────────────────

alter table public.token_logs replica identity full;
alter table public.puzzle_inventory replica identity full;
alter table public.groups replica identity full;
alter table public.game_config_rules replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.groups;
exception
  when others then null;
end $$;

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

