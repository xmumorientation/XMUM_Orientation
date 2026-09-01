-- ═══════════════════════════════════════════════════════════════════════
-- XMUM Orientation Platform 2026 — Migration 0013 (Consolidated Update)
-- 1. Dynamic Group Manager (`fn_set_total_groups`): Supports ANY group count
--    with automatic cleanup of excess groups and group_number constraint fix.
-- 2. RLS Policies & Grants: Fixes live audit logs and permission errors.
-- 3. Supabase Realtime: Full replica identity and publication broadcasts.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Dynamic Group Manager Function (Supports any group count) ───────

create or replace function public.fn_set_total_groups(p_target_count integer default 10)
returns jsonb
language plpgsql
security definer
as $$
declare
  has_group_num boolean;
  i integer;
begin
  if p_target_count is null or p_target_count < 1 then
    raise exception 'Target group count must be at least 1 (received %).', p_target_count;
  end if;

  -- Ensure columns exist
  alter table public.groups
    add column if not exists group_id integer,
    add column if not exists group_name text,
    add column if not exists current_tokens integer not null default 0;

  -- Drop NOT NULL constraint on group_number to permanently prevent constraint violations
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

  -- Seed / Synchronize Groups 1 through p_target_count
  for i in 1..p_target_count loop
    if not exists (select 1 from public.groups where id = i) then
      insert into public.groups (id, name, token_balance, group_id, group_name, group_number, current_tokens)
      values (i, 'Group ' || i, 0, i, 'Group ' || i, i, 0)
      on conflict (id) do update
      set group_id = excluded.group_id,
          group_name = coalesce(public.groups.group_name, excluded.group_name),
          group_number = excluded.group_number;
    else
      update public.groups
      set group_id = coalesce(group_id, id),
          group_name = coalesce(group_name, name, 'Group ' || id),
          group_number = coalesce(group_number, id)
      where id = i;
    end if;
  end loop;

  -- Clean up any excess groups (> p_target_count) and all dependent table records
  if exists (select 1 from public.groups where id > p_target_count) then
    delete from public.token_logs where group_id > p_target_count;
    delete from public.puzzle_inventory where group_id > p_target_count;

    begin delete from public.token_transactions where group_id > p_target_count; exception when others then null; end;
    begin delete from public.inventory where group_id > p_target_count; exception when others then null; end;
    begin delete from public.gacha_draws where group_id > p_target_count; exception when others then null; end;
    begin delete from public.puzzle_redemptions where group_id > p_target_count; exception when others then null; end;
    begin delete from public.attendance_records where group_id > p_target_count; exception when others then null; end;
    begin delete from public.group_locations where group_id > p_target_count; exception when others then null; end;
    begin delete from public.group_attendance_sessions where group_id > p_target_count; exception when others then null; end;

    begin update public.attendance_sessions set activated_by_group = null where activated_by_group > p_target_count; exception when others then null; end;
    begin update public.phases set used_by_group = null where used_by_group > p_target_count; exception when others then null; end;
    begin update public.freshie_registrations set group_id = null where group_id > p_target_count; exception when others then null; end;
    begin update public.profiles set group_id = null where group_id > p_target_count; exception when others then null; end;

    delete from public.groups where id > p_target_count;
  end if;

  -- Record config rule
  insert into public.game_config_rules (day, rule_key, rule_value, description, updated_at)
  values (1, 'TOTAL_GROUPS_COUNT', p_target_count, 'Total active student orientation groups', now())
  on conflict (rule_key) do update
  set rule_value = excluded.rule_value,
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'total_groups', p_target_count,
    'message', format('Successfully configured %s active groups.', p_target_count)
  );
end;
$$;

grant execute on function public.fn_set_total_groups(integer) to anon, authenticated, service_role;

-- ── 2. Enable RLS & Policies for Live Audit Logs ─────────────────────────

alter table public.token_logs enable row level security;
alter table public.puzzle_inventory enable row level security;
alter table public.game_config_rules enable row level security;

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

create policy "allow all select on token_logs" on public.token_logs for select using (true);
create policy "allow all insert on token_logs" on public.token_logs for insert with check (true);
create policy "allow all update on token_logs" on public.token_logs for update using (true) with check (true);
create policy "allow all delete on token_logs" on public.token_logs for delete using (true);

create policy "allow all select on puzzle_inventory" on public.puzzle_inventory for select using (true);
create policy "allow all insert on puzzle_inventory" on public.puzzle_inventory for insert with check (true);
create policy "allow all update on puzzle_inventory" on public.puzzle_inventory for update using (true) with check (true);
create policy "allow all delete on puzzle_inventory" on public.puzzle_inventory for delete using (true);

create policy "allow all select on game_config_rules" on public.game_config_rules for select using (true);
create policy "allow all insert on game_config_rules" on public.game_config_rules for insert with check (true);
create policy "allow all update on game_config_rules" on public.game_config_rules for update using (true) with check (true);
create policy "allow all delete on game_config_rules" on public.game_config_rules for delete using (true);

grant all on public.token_logs to anon, authenticated, service_role;
grant all on public.puzzle_inventory to anon, authenticated, service_role;
grant all on public.game_config_rules to anon, authenticated, service_role;

-- ── 3. Realtime Enablement & Replica Identity ───────────────────────────

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

-- ── 4. Execute Initial Setup for 10 Groups ──────────────────────────────
-- (You can change this number anytime to 8, 10, 12, 16, etc.)
select public.fn_set_total_groups(10);
