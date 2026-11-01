-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0107: Admin → Live control → Game master (run after 0102).
-- Plan: docs/plans/admin-game-master.md
--
-- D-day backup tools for Admin only (is_admin()). They do not look at the
-- games' phases, the schedule or the Day 2 switches. The one kill-switch they
-- respect is "Freeze token mutations" (tokens only).
--
--   fn_admin_token_adjust   add or deduct tokens (±50), with a reason
--   fn_admin_give_piece     give a puzzle piece the group does not own
--   fn_admin_give_blindbox  give 1 to 5 unopened blind boxes (a "gift")
--   fn_admin_undo_gift      take back a gift box that is still unopened
--
-- A gift is a blind_box_claims row with gift = true, status 'owned' and
-- price 0. The Freshie Items page lists it like any bought box and opens it
-- with fn_bb_open (its range row is written here). It uses no seller quantity
-- and no type stock, does not count toward the group's cap, and is left out of
-- "Blind boxes sold" (fn_live_ops).
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Gift boxes ───────────────────────────────────────────────────────

alter table public.blind_box_claims add column if not exists gift boolean not null default false;
alter table public.blind_box_claims drop constraint if exists bb_claim_one_seller;
alter table public.blind_box_claims
  add constraint bb_claim_one_seller
  check (num_nonnulls(seller_profile_id, seller_station_id) + spot::int + gift::int = 1);

-- The group's cap counts bought boxes only. Patch every function that counts
-- them (fn_bb_buy and fn_bb_seller_preview) instead of copying them here.
do $$
declare
  f regprocedure;
  def text;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and pg_get_functiondef(p.oid) like '%where group_id = v_group and not spot;%'
  loop
    def := pg_get_functiondef(f);
    execute replace(def, 'where group_id = v_group and not spot;', 'where group_id = v_group and not spot and not gift;');
  end loop;
end;
$$;

-- ── 2. Live ops: gifts are not sales ────────────────────────────────────

create or replace function public.fn_live_ops()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v jsonb;
begin
  if public.my_role() not in ('hof', 'hogm', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;
  select jsonb_build_object(
    'tokens_in_circulation', (select coalesce(sum(token_balance), 0) from public.groups),
    'transactions_count',    (select count(*) from public.token_transactions),
    'blindbox_claims',       (select count(*) from public.blind_box_claims where not gift),
    'blindbox_tokens_in',    (select coalesce(sum(price), 0) from public.blind_box_claims where not gift),
    'pieces_granted',        (select count(*) from public.inventory where item_type = 'puzzle'),
    'sets_redeemed',         (select count(*) from public.puzzle_redemptions),
    'projectors_activated',  (select count(*) from public.projectors where activated_at is not null)
  ) into v;
  return v;
end;
$$;

-- ── 3. Tokens ───────────────────────────────────────────────────────────

create or replace function public.fn_admin_token_adjust(
  p_group_id integer,
  p_delta integer,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_balance integer;
  v_tx_id bigint;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if public.config_bool('tokens_frozen', false) then
    raise exception 'TOKENS_FROZEN';
  end if;
  if p_delta = 0 or abs(p_delta) > 50 then
    raise exception 'INVALID_DELTA';
  end if;

  if p_idempotency_key is not null then
    select id into v_tx_id from public.token_transactions where idempotency_key = p_idempotency_key;
    if found then
      select token_balance into v_balance from public.groups where id = p_group_id;
      return jsonb_build_object('ok', true, 'duplicate', true, 'transaction_id', v_tx_id, 'balance', v_balance);
    end if;
  end if;

  update public.groups set token_balance = token_balance + p_delta
   where id = p_group_id
   returning token_balance into v_balance;
  if not found then
    raise exception 'GROUP_NOT_FOUND';
  end if;

  insert into public.token_transactions (group_id, delta, reason, actor, station_id, idempotency_key)
  values (p_group_id, p_delta,
          'ADMIN BACKUP: ' || coalesce(nullif(trim(p_reason), ''), 'manual adjustment'),
          auth.uid(), null, p_idempotency_key)
  returning id into v_tx_id;

  perform public.audit('tokens.admin_adjust', 'group:' || p_group_id,
    jsonb_build_object('delta', p_delta, 'reason', p_reason, 'balance_after', v_balance));

  return jsonb_build_object('ok', true, 'duplicate', false, 'transaction_id', v_tx_id,
                            'delta', p_delta, 'balance', v_balance);
exception
  when check_violation then
    raise exception 'INSUFFICIENT_BALANCE';
end;
$$;

-- ── 4. Puzzle pieces ────────────────────────────────────────────────────

create or replace function public.fn_admin_give_piece(
  p_group_id integer,
  p_location public.projector_location,
  p_index integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_item record;
  v_inv_id bigint;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not exists (select 1 from public.groups where id = p_group_id) then
    raise exception 'GROUP_NOT_FOUND';
  end if;

  if p_idempotency_key is not null then
    select id into v_inv_id from public.inventory where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'duplicate', true, 'inventory_id', v_inv_id);
    end if;
  end if;

  select id, type into v_item from public.items
   where type = 'puzzle' and puzzle_location = p_location and puzzle_index = p_index;
  if not found then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  insert into public.inventory (group_id, item_id, item_type, source, granted_by, idempotency_key)
  values (p_group_id, v_item.id, v_item.type, 'admin_grant', auth.uid(), p_idempotency_key)
  returning id into v_inv_id;

  perform public.audit('inventory.admin_give_piece', 'group:' || p_group_id,
    jsonb_build_object('location', p_location, 'index', p_index));

  return jsonb_build_object('ok', true, 'duplicate', false, 'inventory_id', v_inv_id);
exception
  when unique_violation then
    raise exception 'DUPLICATE_PUZZLE_PIECE';
end;
$$;

-- ── 5. Blind box gifts ──────────────────────────────────────────────────

create or replace function public.fn_admin_give_blindbox(
  p_group_id integer,
  p_type_id integer,
  p_quantity integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_t public.blind_box_types;
  v_ids bigint[] := '{}';
  v_id bigint;
  i integer;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 5 then
    raise exception 'INVALID_QUANTITY';
  end if;
  if not exists (select 1 from public.groups where id = p_group_id) then
    raise exception 'GROUP_NOT_FOUND';
  end if;

  select * into v_t from public.blind_box_types where id = p_type_id and not archived and not is_spot;
  if not found then
    raise exception 'BOX_UNKNOWN';
  end if;

  if p_idempotency_key is not null then
    select array_agg(id order by id) into v_ids from public.blind_box_claims
     where idempotency_key like p_idempotency_key || ':%';
    if v_ids is not null then
      return jsonb_build_object('ok', true, 'duplicate', true, 'claim_ids', to_jsonb(v_ids));
    end if;
    v_ids := '{}';
  end if;

  for i in 1..p_quantity loop
    insert into public.blind_box_claims (
      assignment_id, type_id, type_name, seller_name, seller_profile_id, seller_station_id,
      spot, gift, group_id, price, tokens, special, claimed_by, idempotency_key, status
    ) values (
      null, v_t.id, v_t.name, 'Admin gift', null, null,
      false, true, p_group_id, 0, null, v_t.is_special, auth.uid(),
      case when p_idempotency_key is null then null else p_idempotency_key || ':' || i end,
      'owned'
    ) returning id into v_id;
    insert into public.blind_box_claim_ranges (claim_id, min_tokens, max_tokens)
    values (v_id, v_t.min_tokens, v_t.max_tokens);
    v_ids := v_ids || v_id;
  end loop;

  perform public.audit('blindbox.admin_gift', 'group:' || p_group_id,
    jsonb_build_object('type', v_t.id, 'type_name', v_t.name, 'quantity', p_quantity));

  return jsonb_build_object('ok', true, 'duplicate', false, 'claim_ids', to_jsonb(v_ids));
end;
$$;

-- Take back gift boxes the group has not opened (the Undo on the toast).
create or replace function public.fn_admin_undo_gift(p_claim_ids bigint[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_n integer;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  delete from public.blind_box_claims
   where id = any (p_claim_ids) and gift and status = 'owned';
  get diagnostics v_n = row_count;
  if v_n < coalesce(array_length(p_claim_ids, 1), 0) then
    raise exception 'GIFT_ALREADY_OPENED';
  end if;
  perform public.audit('blindbox.admin_gift_undo', 'claims', jsonb_build_object('claims', p_claim_ids));
  return jsonb_build_object('ok', true, 'removed', v_n);
end;
$$;

-- ── 6. Grants ───────────────────────────────────────────────────────────

revoke all on function public.fn_admin_token_adjust(integer, integer, text, text) from public, anon;
revoke all on function public.fn_admin_give_piece(integer, public.projector_location, integer, text) from public, anon;
revoke all on function public.fn_admin_give_blindbox(integer, integer, integer, text) from public, anon;
revoke all on function public.fn_admin_undo_gift(bigint[]) from public, anon;
grant execute on function public.fn_admin_token_adjust(integer, integer, text, text) to authenticated;
grant execute on function public.fn_admin_give_piece(integer, public.projector_location, integer, text) to authenticated;
grant execute on function public.fn_admin_give_blindbox(integer, integer, integer, text) to authenticated;
grant execute on function public.fn_admin_undo_gift(bigint[]) to authenticated;
