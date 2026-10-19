-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0091: blind box fixes from the 2026-10-19 review (run after 0090)
-- (Written as 0080 and already run on the live project under that name;
-- renumbered after main's own 0079-0089. Safe to run again.)
--
-- 1. fn_bb_reset
--    a. "Reset everything" also gives every seller a new random QR version,
--       so a QR shown or screenshotted during a rehearsal does not come back
--       to life when real stock goes to the same account or station.
--    b. "Put tokens back" only undoes what is still in the balances. The
--       Token page reset (fn_reset_tokens_and_puzzles, audit 'tokens.reset')
--       zeroes every group but keeps bought boxes; refunding their price on
--       top of 0 left groups with tokens. Now a box bought before the last
--       token reset refunds nothing (only the prize, if it was opened after
--       that reset).
-- 2. A seller account changed to a role that cannot hold boxes (Faci,
--    Freshie) has its own assignments turned off. They could no longer see
--    their card, but a copy of their QR still sold. Changing the role back
--    turns on again exactly the assignments the role change turned off
--    (`off_by_role`); ones Admin had switched off stay off.
-- 3. fn_bb_buy_at: BUY with the price the Freshie was shown. If Admin changed
--    the price in the meantime, nothing is charged (BB_PRICE_CHANGED) and the
--    page reloads with the new price. fn_bb_buy itself is unchanged.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Reset ───────────────────────────────────────────────────────────

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
  v_token_reset timestamptz;
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

  -- Balances were zeroed at the last token reset: what happened before it is
  -- no longer in them.
  select coalesce(max(created_at), '-infinity'::timestamptz) into v_token_reset
    from public.audit_log where action = 'tokens.reset';

  -- put each group's tokens back (groups locked in id order)
  if v_refund then
    for r in
      select group_id,
             sum(case
                   when created_at > v_token_reset then coalesce(tokens, 0) - price
                   when opened_at > v_token_reset then coalesce(tokens, 0)
                   else 0
                 end)::integer as net
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

  delete from public.blind_box_claims where true;  -- ranges cascade
  update public.blind_box_assignments set opened = 0 where opened <> 0;

  if p_scope = 'all' then
    select count(*) into v_assignments from public.blind_box_assignments;
    select count(*) into v_types from public.blind_box_types;
    delete from public.blind_box_assignments where true;
    delete from public.blind_box_types where true;
    -- every QR from before the reset stops working
    update public.blind_box_sellers set qr_version = public.bb_new_qr_version() where true;
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

-- ── 2. Role change turns a seller's own boxes off (and back on) ────────

alter table public.blind_box_assignments
  add column if not exists off_by_role boolean not null default false;

create or replace function public.trg_bb_role_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.bb_holder_role(new.role) then
    update public.blind_box_assignments set active = false, off_by_role = true
     where profile_id = new.id and active;
  else
    update public.blind_box_assignments set active = true, off_by_role = false
     where profile_id = new.id and off_by_role;
  end if;
  return null;
end;
$$;

drop trigger if exists bb_role_change on public.profiles;
create trigger bb_role_change
  after update of role on public.profiles
  for each row
  when (old.role is distinct from new.role)
  execute function public.trg_bb_role_change();

-- Accounts already moved to a non-holder role before this migration. The
-- by-hand trigger below is dropped first, so a second run of this file does
-- not clear off_by_role again.
drop trigger if exists bb_active_by_hand on public.blind_box_assignments;
update public.blind_box_assignments a set active = false, off_by_role = true
  from public.profiles p
 where a.profile_id = p.id and a.active and not public.bb_holder_role(p.role);

-- Admin switching an assignment on or off by hand takes over from the role
-- change: a later role change back does not override Admin's choice.
create or replace function public.trg_bb_active_by_hand()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if pg_trigger_depth() = 1 and new.active is distinct from old.active then
    new.off_by_role := false;
  end if;
  return new;
end;
$$;

drop trigger if exists bb_active_by_hand on public.blind_box_assignments;
create trigger bb_active_by_hand
  before update of active on public.blind_box_assignments
  for each row execute function public.trg_bb_active_by_hand();

-- ── 3. BUY at the price that was shown ─────────────────────────────────
-- fn_bb_buy decides the price and returns it; if it is not the one the page
-- showed, raising here rolls the whole purchase back. A retry of a purchase
-- that already went through returns it as before (fn_bb_buy's duplicate).

create or replace function public.fn_bb_buy_at(
  p_seller_id integer,
  p_version integer,
  p_assignment_id integer,
  p_idempotency_key text,
  p_expected_price integer
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_res jsonb;
begin
  v_res := public.fn_bb_buy(p_seller_id, p_version, p_assignment_id, p_idempotency_key);
  if p_expected_price is not null
     and not coalesce((v_res->>'duplicate')::boolean, false)
     and (v_res->>'price')::integer is distinct from p_expected_price then
    raise exception 'BB_PRICE_CHANGED';
  end if;
  return v_res;
end;
$$;

revoke all on function public.fn_bb_buy_at(integer, integer, integer, text, integer) from public, anon;
grant execute on function public.fn_bb_buy_at(integer, integer, integer, text, integer) to authenticated;
