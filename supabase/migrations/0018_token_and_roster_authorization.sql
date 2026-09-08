-- Integrate the token/roster modules with the four-role authorization model.
-- Existing calculations remain unchanged; wrappers add authoritative role and
-- GM station checks before invoking them.

drop policy if exists "allow all select on token_logs" on public.token_logs;
drop policy if exists "allow all insert on token_logs" on public.token_logs;
drop policy if exists "allow all update on token_logs" on public.token_logs;
drop policy if exists "allow all delete on token_logs" on public.token_logs;
create policy "permitted users read token logs" on public.token_logs
  for select using (public.has_permission('token.view') or public.has_permission('token.play') or public.has_permission('token.manage'));
create policy "admin corrects token logs" on public.token_logs
  for all using (public.has_permission('token.manage')) with check (public.has_permission('token.manage'));

drop policy if exists "allow all select on puzzle_inventory" on public.puzzle_inventory;
drop policy if exists "allow all insert on puzzle_inventory" on public.puzzle_inventory;
drop policy if exists "allow all update on puzzle_inventory" on public.puzzle_inventory;
drop policy if exists "allow all delete on puzzle_inventory" on public.puzzle_inventory;
create policy "permitted users read puzzle inventory" on public.puzzle_inventory
  for select using (public.has_permission('token.view') or public.has_permission('token.play') or public.has_permission('token.manage'));
create policy "admin corrects puzzle inventory" on public.puzzle_inventory
  for all using (public.has_permission('token.manage')) with check (public.has_permission('token.manage'));

drop policy if exists "allow all select on game_config_rules" on public.game_config_rules;
drop policy if exists "allow all insert on game_config_rules" on public.game_config_rules;
drop policy if exists "allow all update on game_config_rules" on public.game_config_rules;
drop policy if exists "allow all delete on game_config_rules" on public.game_config_rules;
create policy "permitted users read token rules" on public.game_config_rules
  for select using (public.has_permission('token.view') or public.has_permission('token.play') or public.has_permission('token.manage'));
create policy "admin manages token rules" on public.game_config_rules
  for all using (public.has_permission('token.manage')) with check (public.has_permission('token.manage'));

drop policy if exists "allow all select on freshies" on public.freshies;
drop policy if exists "allow all insert on freshies" on public.freshies;
drop policy if exists "allow all update on freshies" on public.freshies;
drop policy if exists "allow all delete on freshies" on public.freshies;
create policy "admin manages freshie roster" on public.freshies
  for all using (public.has_permission('accounts.manage')) with check (public.has_permission('accounts.manage'));

revoke all on public.token_logs, public.puzzle_inventory, public.game_config_rules, public.freshies from anon;
grant select on public.token_logs, public.puzzle_inventory, public.game_config_rules, public.freshies to authenticated;
grant insert, update, delete on public.token_logs, public.puzzle_inventory, public.game_config_rules, public.freshies to authenticated;

-- Token gameplay wrappers.
alter function public.fn_day1_record_result(integer, integer, integer, text)
  rename to fn_day1_record_result_unchecked;
create function public.fn_day1_record_result(
  p_win_group_id integer default null, p_lose_group_id integer default null,
  p_station_id integer default null, p_notes text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.has_permission('token.play') then raise exception 'PERMISSION_DENIED'; end if;
  if p_station_id is null or p_station_id is distinct from public.my_station_id(1) then raise exception 'STATION_ASSIGNMENT_REQUIRED'; end if;
  return public.fn_day1_record_result_unchecked(p_win_group_id, p_lose_group_id, p_station_id, p_notes);
end; $$;

alter function public.fn_day2_deduct_entry(integer, integer, integer, text)
  rename to fn_day2_deduct_entry_unchecked;
create function public.fn_day2_deduct_entry(
  p_group_id integer, p_token_cost integer, p_station_id integer default null,
  p_notes text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.has_permission('token.play') then raise exception 'PERMISSION_DENIED'; end if;
  if p_station_id is null or p_station_id is distinct from public.my_station_id(2) then raise exception 'STATION_ASSIGNMENT_REQUIRED'; end if;
  return public.fn_day2_deduct_entry_unchecked(p_group_id, p_token_cost, p_station_id, p_notes);
end; $$;

alter function public.fn_day2_award_piece(integer, integer, character varying, integer)
  rename to fn_day2_award_piece_unchecked;
create function public.fn_day2_award_piece(
  p_group_id integer, p_location_id integer, p_piece_id varchar(50),
  p_station_id integer default null
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.has_permission('token.play') then raise exception 'PERMISSION_DENIED'; end if;
  if p_station_id is null or p_station_id is distinct from public.my_station_id(2) then raise exception 'STATION_ASSIGNMENT_REQUIRED'; end if;
  return public.fn_day2_award_piece_unchecked(p_group_id, p_location_id, p_piece_id, p_station_id);
end; $$;

alter function public.fn_manual_token_adjust(integer, integer, character varying, text)
  rename to fn_manual_token_adjust_unchecked;
create function public.fn_manual_token_adjust(
  p_group_id integer, p_amount integer,
  p_transaction_type varchar(50) default 'MANUAL_ADMIN_ADJUST',
  p_notes text default 'Manual adjustment'
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.has_permission('token.manage') then raise exception 'PERMISSION_DENIED'; end if;
  return public.fn_manual_token_adjust_unchecked(p_group_id, p_amount, p_transaction_type, p_notes);
end; $$;

alter function public.fn_update_game_config_rule(character varying, integer)
  rename to fn_update_game_config_rule_unchecked;
create function public.fn_update_game_config_rule(p_rule_key varchar(100), p_rule_value integer)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.has_permission('token.manage') then raise exception 'PERMISSION_DENIED'; end if;
  return public.fn_update_game_config_rule_unchecked(p_rule_key, p_rule_value);
end; $$;

revoke all on function public.fn_day1_record_result_unchecked(integer, integer, integer, text) from public, anon, authenticated;
revoke all on function public.fn_day2_deduct_entry_unchecked(integer, integer, integer, text) from public, anon, authenticated;
revoke all on function public.fn_day2_award_piece_unchecked(integer, integer, character varying, integer) from public, anon, authenticated;
revoke all on function public.fn_manual_token_adjust_unchecked(integer, integer, character varying, text) from public, anon, authenticated;
revoke all on function public.fn_update_game_config_rule_unchecked(character varying, integer) from public, anon, authenticated;
revoke all on function public.fn_day1_record_result(integer, integer, integer, text) from public, anon;
revoke all on function public.fn_day2_deduct_entry(integer, integer, integer, text) from public, anon;
revoke all on function public.fn_day2_award_piece(integer, integer, character varying, integer) from public, anon;
revoke all on function public.fn_manual_token_adjust(integer, integer, character varying, text) from public, anon;
revoke all on function public.fn_update_game_config_rule(character varying, integer) from public, anon;
grant execute on function public.fn_day1_record_result(integer, integer, integer, text) to authenticated;
grant execute on function public.fn_day2_deduct_entry(integer, integer, integer, text) to authenticated;
grant execute on function public.fn_day2_award_piece(integer, integer, character varying, integer) to authenticated;
grant execute on function public.fn_manual_token_adjust(integer, integer, character varying, text) to authenticated;
grant execute on function public.fn_update_game_config_rule(character varying, integer) to authenticated;

-- The roster remains Admin-managed even though older migrations granted these
-- helpers to anonymous callers.
alter function public.fn_set_total_groups(integer) rename to fn_set_total_groups_unchecked;
create function public.fn_set_total_groups(p_target_count integer default 10)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.has_permission('accounts.manage') then raise exception 'PERMISSION_DENIED'; end if;
  return public.fn_set_total_groups_unchecked(p_target_count);
end; $$;

alter function public.fn_admin_update_freshie(bigint, text, text, public.freshie_gender, public.freshie_nationality, text, integer)
  rename to fn_admin_update_freshie_unchecked;
create function public.fn_admin_update_freshie(
  p_freshie_id bigint, p_full_name text, p_phone text default null,
  p_gender public.freshie_gender default 'Male',
  p_nationality public.freshie_nationality default 'Local',
  p_student_id text default null, p_group_id integer default null
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.has_permission('accounts.manage') then raise exception 'PERMISSION_DENIED'; end if;
  return public.fn_admin_update_freshie_unchecked(p_freshie_id, p_full_name, p_phone, p_gender, p_nationality, p_student_id, p_group_id);
end; $$;

alter function public.fn_admin_delete_freshie(bigint) rename to fn_admin_delete_freshie_unchecked;
create function public.fn_admin_delete_freshie(p_freshie_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.has_permission('accounts.manage') then raise exception 'PERMISSION_DENIED'; end if;
  return public.fn_admin_delete_freshie_unchecked(p_freshie_id);
end; $$;

revoke all on function public.fn_set_total_groups_unchecked(integer) from public, anon, authenticated;
revoke all on function public.fn_admin_update_freshie_unchecked(bigint, text, text, public.freshie_gender, public.freshie_nationality, text, integer) from public, anon, authenticated;
revoke all on function public.fn_admin_delete_freshie_unchecked(bigint) from public, anon, authenticated;
revoke execute on function public.fn_set_total_groups(integer) from public, anon;
revoke execute on function public.fn_set_freshie_group_count(integer) from public, anon;
revoke execute on function public.fn_admin_update_freshie(bigint, text, text, public.freshie_gender, public.freshie_nationality, text, integer) from public, anon;
revoke execute on function public.fn_admin_delete_freshie(bigint) from public, anon;
grant execute on function public.fn_set_total_groups(integer) to authenticated;
grant execute on function public.fn_admin_update_freshie(bigint, text, text, public.freshie_gender, public.freshie_nationality, text, integer) to authenticated;
grant execute on function public.fn_admin_delete_freshie(bigint) to authenticated;
