-- ═══════════════════════════════════════════════════════════════════════
-- XMUM Orientation Platform 2026 — Migration 0013 (Consolidated Update)
-- 1. Universal Dynamic Group Manager (`fn_set_total_groups`): Supports ANY
--    group count with automatic cascade cleanup & group_number constraint fix.
-- 2. Freshie CRUD RPCs (`fn_admin_update_freshie`, `fn_admin_delete_freshie`)
--    and full RLS policies on `freshies` for registration counter.
-- 3. RLS Policies & Grants: Fixes live audit logs and permission errors.
-- 4. Supabase Realtime: Full replica identity and publication broadcasts.
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
    begin update public.freshies set group_id = null where group_id > p_target_count; exception when others then null; end;

    delete from public.groups where id > p_target_count;
  end if;

  -- Record config rule in game_config_rules and game_config
  insert into public.game_config_rules (day, rule_key, rule_value, description, updated_at)
  values (1, 'TOTAL_GROUPS_COUNT', p_target_count, 'Total active student orientation groups', now())
  on conflict (rule_key) do update
  set rule_value = excluded.rule_value,
      updated_at = now();

  begin
    insert into public.game_config (key, value, updated_by)
    values ('freshie_total_groups', to_jsonb(p_target_count), auth.uid())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  exception when others then null; end;

  return jsonb_build_object(
    'ok', true,
    'total_groups', p_target_count,
    'message', format('Successfully configured %s active groups.', p_target_count)
  );
end;
$$;

grant execute on function public.fn_set_total_groups(integer) to anon, authenticated, service_role;

-- Link fn_set_freshie_group_count to use the universal group manager
create or replace function public.fn_set_freshie_group_count(p_count integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  return public.fn_set_total_groups(p_count);
end;
$$;

grant execute on function public.fn_set_freshie_group_count(integer) to anon, authenticated, service_role;

-- ── 2. Freshie CRUD RPC Functions ────────────────────────────────────────

-- Update Freshie details
create or replace function public.fn_admin_update_freshie(
  p_freshie_id bigint,
  p_full_name text,
  p_phone text default null,
  p_gender public.freshie_gender default 'Male',
  p_nationality public.freshie_nationality default 'Local',
  p_student_id text default null,
  p_group_id integer default null
)
returns jsonb
language plpgsql
security definer
as $$
begin
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Full name is required.';
  end if;

  if p_group_id is not null and not exists (select 1 from public.groups where id = p_group_id) then
    raise exception 'Selected group does not exist.';
  end if;

  update public.freshies
  set full_name = trim(p_full_name),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      gender = p_gender,
      nationality = p_nationality,
      student_id = nullif(trim(coalesce(p_student_id, '')), ''),
      group_id = p_group_id
  where id = p_freshie_id;

  if not found then
    raise exception 'Freshie record not found.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'freshie_id', p_freshie_id,
    'message', 'Freshie details updated successfully.'
  );
end;
$$;

-- Delete Freshie record
create or replace function public.fn_admin_delete_freshie(
  p_freshie_id bigint
)
returns jsonb
language plpgsql
security definer
as $$
begin
  delete from public.freshies where id = p_freshie_id;
  if not found then
    raise exception 'Freshie record not found.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'freshie_id', p_freshie_id,
    'message', 'Freshie deleted successfully.'
  );
end;
$$;

grant execute on function public.fn_admin_update_freshie(bigint, text, text, public.freshie_gender, public.freshie_nationality, text, integer) to anon, authenticated, service_role;
grant execute on function public.fn_admin_delete_freshie(bigint) to anon, authenticated, service_role;

-- ── 3. Enable RLS & Policies for Token Logs, Inventory & Freshies ─────────

alter table public.token_logs enable row level security;
alter table public.puzzle_inventory enable row level security;
alter table public.game_config_rules enable row level security;
alter table public.freshies enable row level security;

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

drop policy if exists "allow all select on freshies" on public.freshies;
drop policy if exists "allow all insert on freshies" on public.freshies;
drop policy if exists "allow all update on freshies" on public.freshies;
drop policy if exists "allow all delete on freshies" on public.freshies;

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

create policy "allow all select on freshies" on public.freshies for select using (true);
create policy "allow all insert on freshies" on public.freshies for insert with check (true);
create policy "allow all update on freshies" on public.freshies for update using (true) with check (true);
create policy "allow all delete on freshies" on public.freshies for delete using (true);

grant all on public.token_logs to anon, authenticated, service_role;
grant all on public.puzzle_inventory to anon, authenticated, service_role;
grant all on public.game_config_rules to anon, authenticated, service_role;
grant all on public.freshies to anon, authenticated, service_role;

-- ── 4. Realtime Enablement & Replica Identity ───────────────────────────

alter table public.token_logs replica identity full;
alter table public.puzzle_inventory replica identity full;
alter table public.groups replica identity full;
alter table public.game_config_rules replica identity full;
alter table public.freshies replica identity full;

do $$ begin alter publication supabase_realtime add table public.token_logs; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.puzzle_inventory; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.game_config_rules; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.freshies; exception when others then null; end $$;

-- ── 5. Set Initial Total Groups (Default: 10 groups) ────────────────────
select public.fn_set_total_groups(10);
