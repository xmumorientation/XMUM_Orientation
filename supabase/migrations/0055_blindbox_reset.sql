-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0055: blind box test reset (run AFTER 0054)
--
-- fn_bb_reset gives Admin a safe way to start blind-box testing over:
--
--   'openings'  clears every opened box (claims) and sets each assignment's
--               opened count back to 0. Types, assignments and QR codes stay.
--               Each group's tokens are put back to what they were before the
--               boxes were opened (the net of "prize minus price" is reversed
--               with one labelled token_transactions row per group), so
--               repeated test runs do not drift the token economy.
--   'all'       the above, then also deletes every assignment and box type.
--
-- Guards (so it cannot be hit by accident on the event day):
--   * Admin only
--   * Rehearsal mode must be ON (Admin → Live control)
--   * the caller must pass the word RESET
--
-- Nobody should be opening boxes while it runs: a box opened mid-reset may
-- not be refunded.
--
-- A refund never takes a group below 0 tokens. If a group has since spent the
-- tokens, it is refunded as far as its balance allows and counted as
-- "clamped" in the result.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_bb_reset(p_scope text, p_confirm text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_claims integer;
  v_groups integer := 0;
  v_clamped integer := 0;
  v_net integer := 0;
  v_bal integer;
  v_delta integer;
  v_assignments integer := 0;
  v_types integer := 0;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_scope is null or p_scope not in ('openings', 'all') then
    raise exception 'BB_RESET_SCOPE';
  end if;
  if not public.config_bool('rehearsal_mode', false) then
    raise exception 'BB_RESET_LOCKED';
  end if;
  if p_confirm is distinct from 'RESET' then
    raise exception 'BB_RESET_CONFIRM';
  end if;

  select count(*) into v_claims from public.blind_box_claims;

  -- put each group's tokens back (groups locked in id order)
  for r in
    select group_id, sum(tokens - price)::integer as net
      from public.blind_box_claims
     group by group_id
     order by group_id
  loop
    select token_balance into v_bal from public.groups where id = r.group_id for update;
    v_delta := -r.net;
    if v_bal + v_delta < 0 then
      v_delta := -v_bal;
      v_clamped := v_clamped + 1;
    end if;
    if v_delta <> 0 then
      update public.groups set token_balance = token_balance + v_delta where id = r.group_id;
      insert into public.token_transactions (group_id, delta, reason, actor)
      values (r.group_id, v_delta, 'Blind box test reset (tokens put back)', auth.uid());
      v_net := v_net + v_delta;
    end if;
    v_groups := v_groups + 1;
  end loop;

  delete from public.blind_box_claims;
  update public.blind_box_assignments set opened = 0 where opened <> 0;

  if p_scope = 'all' then
    select count(*) into v_assignments from public.blind_box_assignments;
    select count(*) into v_types from public.blind_box_types;
    delete from public.blind_box_assignments;
    delete from public.blind_box_types;
  end if;

  perform public.audit('blindbox.reset', 'blindbox',
    jsonb_build_object('scope', p_scope, 'claims', v_claims, 'groups', v_groups,
                       'clamped', v_clamped, 'net_token_change', v_net,
                       'assignments_deleted', v_assignments, 'types_deleted', v_types));

  return jsonb_build_object('ok', true, 'scope', p_scope, 'claims', v_claims,
    'groups', v_groups, 'clamped', v_clamped, 'net_token_change', v_net,
    'assignments_deleted', v_assignments, 'types_deleted', v_types);
end;
$$;

revoke all on function public.fn_bb_reset(text, text) from public, anon;
grant execute on function public.fn_bb_reset(text, text) to authenticated;
