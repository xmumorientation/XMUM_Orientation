-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0057: blind box reset gets a "put tokens back" option
-- (run AFTER 0055)
--
-- fn_bb_reset(p_scope, p_confirm, p_refund_tokens default true)
--
--   p_refund_tokens = true   (default, same as 0055) each group's tokens are
--                            put back to what they were before its boxes were
--                            opened, with one labelled token_transactions row
--                            per group.
--   p_refund_tokens = false  group balances and the token log are left alone;
--                            only the openings are cleared and every
--                            assignment goes back to unopened.
--
-- Everything else is unchanged: Admin only, Rehearsal mode must be ON, the
-- caller must pass the word RESET, and the reset is audited (the audit entry
-- now records whether tokens were put back).
--
-- The 2-argument function from 0055 is dropped first. Leaving it would make
-- fn_bb_reset('openings', 'RESET') ambiguous between the two versions.
-- ═══════════════════════════════════════════════════════════════════════

drop function if exists public.fn_bb_reset(text, text);

create or replace function public.fn_bb_reset(
  p_scope text,
  p_confirm text,
  p_refund_tokens boolean default true
)
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
  v_refund boolean := coalesce(p_refund_tokens, true);
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
  if v_refund then
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
  end if;

  delete from public.blind_box_claims;
  update public.blind_box_assignments set opened = 0 where opened <> 0;

  if p_scope = 'all' then
    select count(*) into v_assignments from public.blind_box_assignments;
    select count(*) into v_types from public.blind_box_types;
    delete from public.blind_box_assignments;
    delete from public.blind_box_types;
  end if;

  perform public.audit('blindbox.reset', 'blindbox',
    jsonb_build_object('scope', p_scope, 'claims', v_claims, 'tokens_put_back', v_refund,
                       'groups', v_groups, 'clamped', v_clamped, 'net_token_change', v_net,
                       'assignments_deleted', v_assignments, 'types_deleted', v_types));

  return jsonb_build_object('ok', true, 'scope', p_scope, 'claims', v_claims,
    'tokens_put_back', v_refund, 'groups', v_groups, 'clamped', v_clamped,
    'net_token_change', v_net, 'assignments_deleted', v_assignments,
    'types_deleted', v_types);
end;
$$;

revoke all on function public.fn_bb_reset(text, text, boolean) from public, anon;
grant execute on function public.fn_bb_reset(text, text, boolean) to authenticated;
