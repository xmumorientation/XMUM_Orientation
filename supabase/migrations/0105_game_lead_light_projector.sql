-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0105: light a key (projector) for a chosen group (run after 0104).
--
-- Funfair backup for D-day: HOGM and Admin pick a group and light one of the
-- three keys for it, with no card tap, no Guardian check of the puzzle set,
-- and without the Day 2 Funfair switch or any phase. The key is marked
-- activated_manually, like fn_activate_projector_manual.
--
-- A key is lit by one group and a group lights one key (projectors unique),
-- so a key that is already lit, or a group that already lit another, is
-- refused. Admin can pass p_replace to take the key over: it clears the key
-- and the group's other key first.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_game_lead_light_projector(
  p_location public.projector_location,
  p_group_id integer,
  p_replace boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_before integer;
begin
  if not public.is_game_lead() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_replace and not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not exists (select 1 from public.groups where id = p_group_id) then
    raise exception 'GROUP_NOT_FOUND';
  end if;
  select activated_by_group into v_before from public.projectors where location = p_location for update;
  if not found then
    raise exception 'PROJECTOR_NOT_FOUND';
  end if;

  if p_replace then
    update public.projectors
       set activated_by_group = null, activated_at = null, activated_manually = false, test_run_id = null
     where location = p_location or activated_by_group = p_group_id;
  end if;

  update public.projectors
     set activated_by_group = p_group_id, activated_at = now(), activated_manually = true, test_run_id = null
   where location = p_location and activated_at is null;
  if not found then
    raise exception 'ALREADY_ACTIVATED';
  end if;

  perform public.audit('projector.game_lead_light', 'projector:' || p_location,
    jsonb_build_object('group_id', p_group_id, 'replaced', p_replace, 'was_group_id', v_before));
  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    raise exception 'GROUP_ALREADY_ACTIVATED_ONE';
end;
$$;

revoke all on function public.fn_game_lead_light_projector(public.projector_location, integer, boolean) from public, anon;
grant execute on function public.fn_game_lead_light_projector(public.projector_location, integer, boolean) to authenticated;
