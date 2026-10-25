-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0106: reset the whole funfair, no key lit by any group (run
-- after 0105). Admin only, like fn_admin_reset_projector (one key, 0084).
-- Clears every projector's group and time. Zone overrides, the puzzle
-- redemptions and the NFC cards are not touched.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_admin_reset_all_projectors()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_was jsonb;
  v_n integer;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select coalesce(jsonb_object_agg(location, activated_by_group), '{}'::jsonb)
    into v_was from public.projectors where activated_at is not null;

  update public.projectors
     set activated_by_group = null, activated_at = null, activated_manually = false, test_run_id = null
   where activated_at is not null or activated_by_group is not null;
  get diagnostics v_n = row_count;

  perform public.audit('projector.reset_all', 'projectors', jsonb_build_object('count', v_n, 'was', v_was));
  return jsonb_build_object('ok', true, 'cleared', v_n);
end;
$$;

revoke all on function public.fn_admin_reset_all_projectors() from public, anon;
grant execute on function public.fn_admin_reset_all_projectors() to authenticated;
