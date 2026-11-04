-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0116: delete a station that has token history (Rehearsal mode)
--
-- A station with token history cannot be deleted: token_transactions.station_id
-- (0001) has no ON DELETE rule, so the delete fails. The Stations pages
-- (Admin → Stations, HOGM's Game control → Stations) now close such a station
-- instead. That leaves test stations from a rehearsal stuck on the list.
--
--   fn_delete_station_with_history(p_station_id)
--     * HOGM and Admin (is_game_lead())
--     * Rehearsal mode must be ON (Admin → Live control), so a live event's
--       records cannot be cut loose by mistake
--     * detaches the station from its token_transactions (station_id → null);
--       the rows stay, so every group's ledger and balance are unchanged.
--       token_logs already do this on their own (0012: on delete set null)
--     * deletes the station (GM assignments, check-ins and blind box spots
--       cascade, as in a plain delete) and writes one audit entry
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_delete_station_with_history(p_station_id integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_station public.stations%rowtype;
  v_tx integer;
  v_logs integer;
begin
  if not public.is_game_lead() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not public.config_bool('rehearsal_mode', false) then
    raise exception 'STATION_DELETE_LOCKED';
  end if;

  select * into v_station from public.stations where id = p_station_id;
  if not found then
    raise exception 'STATION_NOT_FOUND';
  end if;

  select count(*) into v_logs from public.token_logs where station_id = p_station_id;

  update public.token_transactions set station_id = null where station_id = p_station_id;
  get diagnostics v_tx = row_count;

  delete from public.stations where id = p_station_id;

  perform public.audit('station.delete', 'station:' || p_station_id,
    jsonb_build_object('name', v_station.name, 'code', v_station.code, 'day', v_station.day,
                       'transactions_detached', v_tx, 'logs_detached', v_logs));

  return jsonb_build_object('ok', true, 'transactions_detached', v_tx, 'logs_detached', v_logs);
end;
$$;

revoke all on function public.fn_delete_station_with_history(integer) from public, anon;
grant execute on function public.fn_delete_station_with_history(integer) to authenticated;
