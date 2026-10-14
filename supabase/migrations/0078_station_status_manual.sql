-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0078: station status is manual only (changesv3.md)
--
-- 1. The game timer no longer touches stations. 0049 added a trigger on
--    public.phases that opened a day's stations when its game started and
--    closed them all when it ended or expired. Dropped. Start / End / the
--    countdown (fn_phase_control, fn_game_toggle, fn_game_expire) now only
--    run the timer.
-- 2. Check-ins no longer change the status either. 0062's fn_refresh_station
--    flipped a station to In Progress when it was full and back to Available
--    when a group left. It is now a no-op (its callers stay as they are):
--    the capacity limit still refuses a full station (STATION_FULL) and
--    Closed still refuses check-in (STATION_CLOSED), but nothing changes the
--    status behind an Admin's or Game Master's back.
-- 3. fn_set_station_status sets exactly what it is given. The three states
--    are Available / In Progress / Closed. Roles are unchanged: HOF, HOGM and
--    Admin can set any station; a GM or Guardian GM only their own.
--
-- Statuses already in the database are left as they are.
-- stations.status_override stays in the table but is no longer used.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Timer decoupling ─────────────────────────────────────────────────

drop trigger if exists phase_station_status on public.phases;
drop function if exists public.trg_phase_station_status();

-- ── 2. No automatic status from check-ins ───────────────────────────────

create or replace function public.fn_refresh_station(p_station_id integer)
returns void
language sql security definer set search_path = public
as $$
  select;
$$;

revoke all on function public.fn_refresh_station(integer) from public, anon, authenticated;

-- the old "manual In Progress" flag means nothing now
update public.stations set status_override = false where status_override;

-- ── 3. Manual status ────────────────────────────────────────────────────

create or replace function public.fn_set_station_status(
  p_station_id integer,
  p_status public.station_status
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.user_role := public.my_role();
  v_own integer;
begin
  if v_role in ('hof', 'hogm', 'admin') then
    null;
  elsif v_role in ('gm', 'guardian_gm') then
    select station_id into v_own from public.profiles where id = auth.uid();
    if v_own is distinct from p_station_id then
      raise exception 'NOT_YOUR_STATION';
    end if;
  else
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.stations set status = p_status where id = p_station_id;
  if not found then raise exception 'STATION_NOT_FOUND'; end if;

  perform public.audit('station.status', 'station:' || p_station_id,
    jsonb_build_object('status', p_status));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fn_set_station_status(integer, public.station_status) from public, anon;
grant execute on function public.fn_set_station_status(integer, public.station_status) to authenticated;
