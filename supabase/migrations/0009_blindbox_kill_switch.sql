-- Blind box kill-switch.
--
-- gacha_disabled was a leftover config key from the retired v1 gacha
-- system (fn_gacha_draw, gacha_pools) — migration 0005 emptied those
-- tables and no client code has called fn_gacha_draw since. The "Disable
-- gacha" admin toggle looked live but did nothing: the current blind box
-- feature (fn_scan_blind_box, fn_sell_blind_box) never checked any
-- kill-switch at all. This migration renames the config key and wires
-- the check into both blind box RPCs, so FR-11.5's "kill-switches, each
-- independent" actually covers blind box.

insert into public.game_config (key, value)
values ('blindbox_disabled', 'false')
on conflict (key) do nothing;

delete from public.game_config where key = 'gacha_disabled';

-- Freshie scans a committee member's blind box QR. Identical to the
-- 0005 definition except for the added blindbox_disabled check.
create or replace function public.fn_scan_blind_box(p_qr_hash text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_group integer := public.my_group_id();
  v_alloc record;
  v_member text;
  v_tokens integer;
  v_balance integer;
begin
  if public.my_role() <> 'freshie' then
    raise exception 'FRESHIE_ONLY';
  end if;
  if v_group is null then
    raise exception 'NOT_IN_GROUP';
  end if;
  if public.config_bool('tokens_frozen', false) then
    raise exception 'TOKENS_FROZEN';
  end if;
  if public.config_bool('blindbox_disabled', false) then
    raise exception 'BLINDBOX_DISABLED';
  end if;

  select a.* into v_alloc from public.blind_box_allocations a
   where a.qr_hash = p_qr_hash and a.active
   for update;
  if not found then
    raise exception 'BOX_UNKNOWN';
  end if;
  if v_alloc.used_boxes >= v_alloc.total_boxes then
    raise exception 'BOXES_SOLD_OUT';
  end if;

  -- one claim per group per committee member (unique constraint backs this)
  begin
    v_tokens := v_alloc.min_tokens
      + floor(random() * (v_alloc.max_tokens - v_alloc.min_tokens + 1))::integer;
    insert into public.blind_box_claims (allocation_id, group_id, tokens, claimed_by)
    values (v_alloc.id, v_group, v_tokens, auth.uid());
  exception when unique_violation then
    raise exception 'ALREADY_CLAIMED_FROM_MEMBER';
  end;

  update public.blind_box_allocations
     set used_boxes = used_boxes + 1 where id = v_alloc.id;

  update public.groups
     set token_balance = token_balance + v_tokens
   where id = v_group
   returning token_balance into v_balance;

  select full_name into v_member from public.profiles where id = v_alloc.profile_id;

  insert into public.token_transactions (group_id, delta, reason, actor)
  values (v_group, v_tokens, 'Blind box from ' || coalesce(v_member, 'committee'), auth.uid());

  perform public.audit('blindbox.claim', 'group:' || v_group,
    jsonb_build_object('allocation', v_alloc.id, 'tokens', v_tokens,
                       'special', v_alloc.box_type = 'special'));

  return jsonb_build_object('ok', true, 'tokens', v_tokens,
                            'special', v_alloc.box_type = 'special',
                            'member_name', v_member, 'balance', v_balance);
end;
$$;

-- GM sells a blind box (limited global stock; price/range from config).
-- Identical to the 0005 definition except for the added
-- blindbox_disabled check.
create or replace function public.fn_sell_blind_box(
  p_group_id integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_price integer := coalesce((select (value #>> '{}')::integer from public.game_config where key = 'gm_blindbox_price'), 2);
  v_min integer := coalesce((select (value #>> '{}')::integer from public.game_config where key = 'gm_blindbox_min'), 1);
  v_max integer := coalesce((select (value #>> '{}')::integer from public.game_config where key = 'gm_blindbox_max'), 2);
  v_stock integer := coalesce((select (value #>> '{}')::integer from public.game_config where key = 'gm_blindbox_stock'), 8);
  v_sold integer;
  v_tokens integer;
  v_balance integer;
  v_tx bigint;
begin
  if public.my_role() not in ('gm', 'guardian_gm', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if public.config_bool('tokens_frozen', false) then
    raise exception 'TOKENS_FROZEN';
  end if;
  if public.config_bool('blindbox_disabled', false) then
    raise exception 'BLINDBOX_DISABLED';
  end if;

  if p_idempotency_key is not null then
    select id into v_tx from public.token_transactions
      where idempotency_key = p_idempotency_key;
    if found then
      select token_balance into v_balance from public.groups where id = p_group_id;
      return jsonb_build_object('ok', true, 'duplicate', true, 'balance', v_balance);
    end if;
  end if;

  -- serialize stock checks
  perform pg_advisory_xact_lock(hashtext('gm_blindbox_stock'));
  select count(*) into v_sold from public.blind_box_sales;
  if v_sold >= v_stock then
    raise exception 'BOXES_SOLD_OUT';
  end if;

  v_tokens := v_min + floor(random() * (v_max - v_min + 1))::integer;

  begin
    update public.groups
       set token_balance = token_balance - v_price + v_tokens
     where id = p_group_id
     returning token_balance into v_balance;
    if not found then raise exception 'GROUP_NOT_FOUND'; end if;
  exception when check_violation then
    raise exception 'INSUFFICIENT_BALANCE';
  end;

  insert into public.blind_box_sales (group_id, price, tokens, actor)
  values (p_group_id, v_price, v_tokens, auth.uid());

  insert into public.token_transactions (group_id, delta, reason, actor, idempotency_key)
  values (p_group_id, v_tokens - v_price,
          'GM blind box (paid ' || v_price || ', won ' || v_tokens || ')',
          auth.uid(), p_idempotency_key)
  returning id into v_tx;

  perform public.audit('blindbox.sale', 'group:' || p_group_id,
    jsonb_build_object('price', v_price, 'tokens', v_tokens));

  return jsonb_build_object('ok', true, 'duplicate', false,
                            'tokens', v_tokens, 'price', v_price, 'balance', v_balance);
end;
$$;
