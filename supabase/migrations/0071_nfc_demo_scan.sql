-- Migration 0071: demo NFC scan, and resetting a lightbulb.
--
-- For testing the map's Lightbulbs view without the physical NFC cards.
--
-- * game_config nfc_demo_mode (off by default). Admin turns it on in Live
--   control. TURN IT OFF BEFORE THE EVENT.
-- * fn_demo_activate_projector(location): while demo mode is on, a Freshie or
--   Faci lights that bulb for their own group. Skips the endgame phase, puzzle
--   set and NFC token checks of fn_activate_projector. Still one group per
--   bulb and one bulb per group. Audit-logged as projector.demo_activate.
-- * fn_admin_reset_projector(location): Admin turns a bulb off again (lit by
--   a demo, a real scan or the Guardian). It does not free a used NFC token;
--   reset tokens on Admin -> NFC if needed.

insert into public.game_config (key, value)
values ('nfc_demo_mode', 'false'::jsonb)
on conflict (key) do nothing;

create or replace function public.fn_demo_activate_projector(p_location public.projector_location)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_group integer := public.my_group_id();
begin
  if not public.config_bool('nfc_demo_mode', false) then
    raise exception 'NFC_DEMO_OFF';
  end if;
  if public.my_role() not in ('freshie', 'faci') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if v_group is null then
    raise exception 'NOT_IN_GROUP';
  end if;

  update public.projectors
     set activated_by_group = v_group, activated_at = now(), activated_manually = false
   where location = p_location and activated_at is null;
  if not found then
    raise exception 'ALREADY_ACTIVATED';
  end if;

  perform public.audit('projector.demo_activate', 'projector:' || p_location,
    jsonb_build_object('group_id', v_group));

  return jsonb_build_object('ok', true, 'location', p_location, 'group_id', v_group);
exception
  when unique_violation then
    raise exception 'GROUP_ALREADY_ACTIVATED_ONE';
end;
$$;

create or replace function public.fn_admin_reset_projector(p_location public.projector_location)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_before integer;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select activated_by_group into v_before
    from public.projectors where location = p_location for update;
  if not found then
    raise exception 'PROJECTOR_NOT_FOUND';
  end if;

  update public.projectors
     set activated_by_group = null, activated_at = null, activated_manually = false
   where location = p_location;

  perform public.audit('projector.reset', 'projector:' || p_location,
    jsonb_build_object('was_group_id', v_before));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fn_demo_activate_projector(public.projector_location) from public, anon;
revoke all on function public.fn_admin_reset_projector(public.projector_location) from public, anon;
grant execute on function public.fn_demo_activate_projector(public.projector_location) to authenticated;
grant execute on function public.fn_admin_reset_projector(public.projector_location) to authenticated;
