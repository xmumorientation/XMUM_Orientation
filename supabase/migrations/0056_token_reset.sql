-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0056: Token page "Reset State" moves into the database
--
-- Before this, /admin/token → Reset State deleted token_logs and
-- puzzle_inventory and zeroed every group's tokens straight from the browser,
-- and only the page itself checked Rehearsal mode. Now the database decides.
--
--   fn_reset_tokens_and_puzzles()
--     * Admin only
--     * Rehearsal mode must be ON (Admin → Live control)
--     * deletes every token_logs and puzzle_inventory row, sets every group's
--       tokens to 0, and writes one audit entry
--     Same scope as the old button. It does NOT touch token_transactions or
--     the newer inventory table.
--
-- Direct deletes on token_logs and puzzle_inventory were open to anyone
-- (0012 / 0013 "allow all delete"). They are now Admin only, so the reset
-- cannot be done by a plain signed-in user or the anon key calling the table
-- API. An Admin can still delete rows directly, e.g. one log entry from the
-- Token page; only the full reset is guarded by Rehearsal mode.
--
-- This is one slice of ROADMAP item 3 (lock down open tables), not all of it:
-- select / insert / update on these tables and the open RPCs are unchanged.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_reset_tokens_and_puzzles()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_logs integer;
  v_pieces integer;
  v_groups integer;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not public.config_bool('rehearsal_mode', false) then
    raise exception 'TOKEN_RESET_LOCKED';
  end if;

  -- "where true": some Supabase setups refuse a DELETE/UPDATE with no WHERE.
  delete from public.puzzle_inventory where true;
  get diagnostics v_pieces = row_count;
  delete from public.token_logs where true;
  get diagnostics v_logs = row_count;
  update public.groups set current_tokens = 0, token_balance = 0 where true;
  get diagnostics v_groups = row_count;

  perform public.audit('tokens.reset', 'tokens',
    jsonb_build_object('logs_deleted', v_logs, 'pieces_deleted', v_pieces,
                       'groups_zeroed', v_groups));

  return jsonb_build_object('ok', true, 'logs_deleted', v_logs,
    'pieces_deleted', v_pieces, 'groups_zeroed', v_groups);
end;
$$;

revoke all on function public.fn_reset_tokens_and_puzzles() from public, anon;
grant execute on function public.fn_reset_tokens_and_puzzles() to authenticated;

-- Deleting rows from these two tables is Admin only from now on.
drop policy if exists "allow all delete on token_logs" on public.token_logs;
drop policy if exists "admin deletes token_logs" on public.token_logs;
create policy "admin deletes token_logs" on public.token_logs
  for delete using (public.is_admin());

drop policy if exists "allow all delete on puzzle_inventory" on public.puzzle_inventory;
drop policy if exists "admin deletes puzzle_inventory" on public.puzzle_inventory;
create policy "admin deletes puzzle_inventory" on public.puzzle_inventory
  for delete using (public.is_admin());
