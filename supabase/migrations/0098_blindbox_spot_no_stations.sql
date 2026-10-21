-- ═══════════════════════════════════════════════════════════════════════
-- Blind box: the Spot box, no more station boxes, one kind of reset.
--
-- 1. Stations no longer hold boxes. Boxes go to people only (an account, or
--    every account with a role). Station assignments with nothing sold are
--    deleted; ones with sales are switched off and kept, so the history and
--    the groups' bought boxes stay. No new station rows can be made.
-- 2. The Spot box: ONE extra seller with ONE QR that never changes. Admin
--    prints it as many times as they like and hides the copies. Admin sets
--    its min / max tokens, how many boxes are in the pool, and on/off
--    (fn_bb_spot_save); none of that changes the QR. A Spot box is free, each
--    group gets at most one, and it does not count toward the group's cap.
--    Inside, the Spot is a hidden box type (is_spot) with one assignment, so
--    buying, opening and the reset all work as for any other box.
-- 3. Reset: only "Restore boxes" (scope 'openings'). "Reset everything" is
--    gone. Restoring also refills the Spot's pool; its QR and settings stay.
-- Safe to run again.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. No station boxes ────────────────────────────────────────────────

delete from public.blind_box_assignments where station_id is not null and opened = 0;
update public.blind_box_assignments set active = false where station_id is not null and active;

-- New station rows are refused by bb_assignment_seller (section 2). Not a
-- check constraint: Postgres re-checks those on every UPDATE, and the reset
-- updates the station rows kept above.

-- Same choice of sellers as before, without stations.
drop function if exists public.fn_bb_assign(integer, integer, public.user_role, uuid[], integer[], boolean);

create or replace function public.fn_bb_assign(
  p_type_id integer,
  p_quantity integer,
  p_role public.user_role default null,
  p_profile_ids uuid[] default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_type public.blind_box_types;
  v_profiles uuid[];
  v_count integer;
  v_need bigint;
  v_assigned bigint;
  v_left bigint;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_quantity is null or p_quantity < 1 then
    raise exception 'BB_RANGE_INVALID';
  end if;
  if (p_role is null) = (p_profile_ids is null) then
    raise exception 'BB_TARGET_INVALID';
  end if;

  select * into v_type from public.blind_box_types where id = p_type_id for update;
  if not found or v_type.is_spot then
    raise exception 'BB_TYPE_NOT_FOUND';
  end if;
  if v_type.archived then
    raise exception 'BB_TYPE_ARCHIVED';
  end if;

  if p_role is not null then
    if not public.bb_holder_role(p_role) then
      raise exception 'BB_TARGET_INVALID';
    end if;
    select array_agg(id) into v_profiles from public.profiles where role = p_role;
  else
    select array_agg(id) into v_profiles
      from public.profiles
     where id = any (p_profile_ids) and public.bb_holder_role(role);
    if coalesce(cardinality(v_profiles), 0) <> cardinality(p_profile_ids) then
      raise exception 'BB_TARGET_INVALID';
    end if;
  end if;

  v_count := coalesce(cardinality(v_profiles), 0);
  if v_count = 0 then
    raise exception 'BB_NO_TARGETS';
  end if;

  select coalesce(sum(quantity), 0) into v_assigned
    from public.blind_box_assignments where type_id = p_type_id;
  v_left := v_type.stock - v_assigned;
  v_need := p_quantity::bigint * v_count;
  if v_need > v_left then
    raise exception 'BB_NOT_ENOUGH_STOCK: need % (% x % sellers) but only % left',
      v_need, p_quantity, v_count, v_left;
  end if;

  insert into public.blind_box_assignments (type_id, profile_id, quantity)
  select p_type_id, p, p_quantity from unnest(v_profiles) as p
  on conflict (type_id, profile_id) where profile_id is not null
  do update set quantity = public.blind_box_assignments.quantity + excluded.quantity;

  perform public.audit('blindbox.assign', 'type:' || p_type_id,
    jsonb_build_object('quantity_each', p_quantity, 'sellers', v_count,
                       'total', v_need, 'role', p_role));
  return jsonb_build_object('ok', true, 'sellers', v_count, 'added', v_need,
                            'left', v_left - v_need);
end;
$$;

revoke all on function public.fn_bb_assign(integer, integer, public.user_role, uuid[]) from public, anon;
grant execute on function public.fn_bb_assign(integer, integer, public.user_role, uuid[]) to authenticated;

-- A seller reads only their own account's boxes now.
drop policy if exists "holder reads own assignments" on public.blind_box_assignments;
create policy "holder reads own assignments" on public.blind_box_assignments
  for select using (public.bb_holder_role(public.my_role()) and profile_id = auth.uid());
drop policy if exists "holder reads own seller" on public.blind_box_sellers;
create policy "holder reads own seller" on public.blind_box_sellers
  for select using (public.bb_holder_role(public.my_role()) and profile_id = auth.uid());

-- ── 2. The Spot ────────────────────────────────────────────────────────

alter table public.blind_box_types add column if not exists is_spot boolean not null default false;
create unique index if not exists blind_box_types_spot_uq on public.blind_box_types (is_spot) where is_spot;

alter table public.blind_box_sellers add column if not exists is_spot boolean not null default false;
create unique index if not exists blind_box_seller_spot_uq on public.blind_box_sellers (is_spot) where is_spot;
alter table public.blind_box_sellers drop constraint if exists bb_seller_one_target;
alter table public.blind_box_sellers
  add constraint bb_seller_one_target check (num_nonnulls(profile_id, station_id) + is_spot::int = 1);

-- The Spot's assignment has no account: its seller_id is the Spot.
alter table public.blind_box_assignments drop constraint if exists bb_assign_one_target;
alter table public.blind_box_assignments
  add constraint bb_assign_one_target check (num_nonnulls(profile_id, station_id) <= 1);

alter table public.blind_box_claims add column if not exists spot boolean not null default false;
alter table public.blind_box_claims drop constraint if exists bb_claim_one_seller;
alter table public.blind_box_claims
  add constraint bb_claim_one_seller check (num_nonnulls(seller_profile_id, seller_station_id) + spot::int = 1);
-- One Spot box per group, however many copies of the QR they find.
create unique index if not exists blind_box_claim_group_spot_uq on public.blind_box_claims (group_id) where spot;

-- New assignments find (or create) their account's seller row; the Spot's is
-- passed in by fn_bb_spot_save.
create or replace function public.bb_assignment_seller()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.station_id is not null then
    raise exception 'BB_TARGET_INVALID';
  end if;
  if new.profile_id is not null then
    insert into public.blind_box_sellers (profile_id) values (new.profile_id)
    on conflict (profile_id) where profile_id is not null do nothing;
    select id into new.seller_id from public.blind_box_sellers where profile_id = new.profile_id;
  end if;
  return new;
end;
$$;

-- A seller with neither an account nor a station is the Spot.
create or replace function public.bb_seller_name(p_profile_id uuid, p_station_id integer)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when p_profile_id is not null
      then coalesce((select nullif(full_name, '') from public.profiles where id = p_profile_id), 'Committee')
    when p_station_id is not null
      then coalesce((select name from public.stations where id = p_station_id), 'Station')
    else 'Hidden blind box'
  end;
$$;

-- Create or change the Spot. The QR (the Spot seller's qr_version) is never
-- touched here. New min / max apply to boxes claimed from now on; the pool
-- cannot go below what is already claimed.
create or replace function public.fn_bb_spot_save(
  p_min integer,
  p_max integer,
  p_pool integer,
  p_active boolean
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_type integer;
  v_seller integer;
  v_a public.blind_box_assignments;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_min is null or p_max is null or p_pool is null
     or p_min < 0 or p_max < p_min or p_pool < 0 then
    raise exception 'BB_RANGE_INVALID';
  end if;

  select id into v_type from public.blind_box_types where is_spot for update;
  if v_type is null then
    insert into public.blind_box_types (name, min_tokens, max_tokens, price, stock, is_spot)
    values ('Hidden box', p_min, p_max, 0, p_pool, true)
    returning id into v_type;
  end if;

  insert into public.blind_box_sellers (is_spot) values (true)
  on conflict (is_spot) where is_spot do nothing;
  select id into v_seller from public.blind_box_sellers where is_spot;

  select * into v_a from public.blind_box_assignments where seller_id = v_seller for update;
  if not found then
    insert into public.blind_box_assignments (type_id, seller_id, quantity, active)
    values (v_type, v_seller, p_pool, coalesce(p_active, true));
  else
    if p_pool < v_a.opened then
      raise exception 'BB_QTY_BELOW_OPENED: % already claimed', v_a.opened;
    end if;
    update public.blind_box_assignments
       set quantity = p_pool, active = coalesce(p_active, true)
     where id = v_a.id;
  end if;
  update public.blind_box_types
     set min_tokens = p_min, max_tokens = p_max, stock = p_pool, price = 0, archived = false
   where id = v_type;

  perform public.audit('blindbox.spot_save', 'spot',
    jsonb_build_object('min', p_min, 'max', p_max, 'pool', p_pool, 'active', coalesce(p_active, true)));
  return jsonb_build_object('ok', true, 'seller_id', v_seller);
end;
$$;

revoke all on function public.fn_bb_spot_save(integer, integer, integer, boolean) from public, anon;
grant execute on function public.fn_bb_spot_save(integer, integer, integer, boolean) to authenticated;

-- Scan page (read-only). As in 0070, plus: 'spot' tells the page it is the
-- Spot; one Spot box per group; Spot boxes do not count toward the cap and
-- are not in group_claims.
create or replace function public.fn_bb_seller_preview(p_seller_id integer, p_version integer)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_group integer := public.my_group_id();
  v_s public.blind_box_sellers;
  v_balance integer;
  v_group_name text;
  v_claims integer;
  v_cap integer := public.bb_group_cap();
  v_status text := 'ok';
  v_options jsonb;
begin
  if public.my_role() is distinct from 'freshie' then
    raise exception 'FRESHIE_ONLY';
  end if;
  if v_group is null then
    raise exception 'NOT_IN_GROUP';
  end if;

  select * into v_s from public.blind_box_sellers where id = p_seller_id;
  if not found or v_s.qr_version is distinct from p_version then
    raise exception 'BOX_UNKNOWN';
  end if;

  select token_balance, coalesce(nullif(display_name, ''), name)
    into v_balance, v_group_name from public.groups where id = v_group;
  select count(*) into v_claims from public.blind_box_claims where group_id = v_group and not spot;

  select coalesce(jsonb_agg(jsonb_build_object(
           'assignment_id', a.id,
           'type_name', t.name,
           'price', t.price,
           'special', t.is_special,
           'left', greatest(a.quantity - a.opened, 0),
           'status', case
                       when a.opened >= a.quantity then 'sold_out'
                       when v_balance < t.price then 'insufficient'
                       else 'ok'
                     end
         ) order by t.price, t.id), '[]'::jsonb)
    into v_options
    from public.blind_box_assignments a
    join public.blind_box_types t on t.id = a.type_id
   where a.seller_id = v_s.id and a.active and not t.archived;

  if jsonb_array_length(v_options) = 0 then
    raise exception 'BOX_UNKNOWN';
  end if;

  if public.config_bool('blindbox_disabled', false) then
    v_status := 'disabled';
  elsif public.config_bool('tokens_frozen', false) then
    v_status := 'frozen';
  elsif exists (
    select 1 from public.blind_box_claims
     where group_id = v_group
       and ((v_s.is_spot and spot)
         or (v_s.profile_id is not null and seller_profile_id = v_s.profile_id)
         or (v_s.station_id is not null and seller_station_id = v_s.station_id))
  ) then
    v_status := 'already_from_seller';
  elsif not v_s.is_spot and v_claims >= v_cap then
    v_status := 'cap_reached';
  elsif not exists (select 1 from jsonb_array_elements(v_options) o where o->>'status' <> 'sold_out') then
    v_status := 'sold_out';
  end if;

  return jsonb_build_object(
    'status', v_status,
    'spot', v_s.is_spot,
    'seller_name', public.bb_seller_name(v_s.profile_id, v_s.station_id),
    'group_name', v_group_name,
    'balance', v_balance,
    'group_claims', v_claims,
    'cap', v_cap,
    'options', v_options
  );
end;
$$;

-- BUY. As in 0070, with the same Spot rules as the preview.
create or replace function public.fn_bb_buy(
  p_seller_id integer,
  p_version integer,
  p_assignment_id integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_group integer := public.my_group_id();
  v_s public.blind_box_sellers;
  v_a public.blind_box_assignments;
  v_t public.blind_box_types;
  v_claim public.blind_box_claims;
  v_balance integer;
  v_claims integer;
  v_seller text;
  v_station integer;
begin
  if public.my_role() is distinct from 'freshie' then
    raise exception 'FRESHIE_ONLY';
  end if;
  if v_group is null then
    raise exception 'NOT_IN_GROUP';
  end if;
  select token_balance into v_balance from public.groups where id = v_group for update;

  if p_idempotency_key is not null then
    select * into v_claim from public.blind_box_claims where idempotency_key = p_idempotency_key;
    if found then
      if v_claim.group_id <> v_group then
        raise exception 'BOX_UNKNOWN';
      end if;
      return jsonb_build_object('ok', true, 'duplicate', true, 'claim_id', v_claim.id,
        'price', v_claim.price, 'special', v_claim.special,
        'seller_name', v_claim.seller_name, 'type_name', v_claim.type_name,
        'balance', v_balance);
    end if;
  end if;

  if public.config_bool('tokens_frozen', false) then
    raise exception 'TOKENS_FROZEN';
  end if;
  if public.config_bool('blindbox_disabled', false) then
    raise exception 'BLINDBOX_DISABLED';
  end if;

  select * into v_s from public.blind_box_sellers where id = p_seller_id;
  if not found or v_s.qr_version is distinct from p_version then
    raise exception 'BOX_UNKNOWN';
  end if;
  select * into v_a from public.blind_box_assignments
   where id = p_assignment_id and seller_id = v_s.id for update;
  if not found or not v_a.active then
    raise exception 'BOX_UNKNOWN';
  end if;
  select * into v_t from public.blind_box_types where id = v_a.type_id;
  if v_t.archived then
    raise exception 'BOX_UNKNOWN';
  end if;

  if v_a.opened >= v_a.quantity then
    raise exception 'BOXES_SOLD_OUT';
  end if;
  if exists (
    select 1 from public.blind_box_claims
     where group_id = v_group
       and ((v_s.is_spot and spot)
         or (v_s.profile_id is not null and seller_profile_id = v_s.profile_id)
         or (v_s.station_id is not null and seller_station_id = v_s.station_id))
  ) then
    raise exception 'BB_ALREADY_FROM_SELLER';
  end if;
  if not v_s.is_spot then
    select count(*) into v_claims from public.blind_box_claims where group_id = v_group and not spot;
    if v_claims >= public.bb_group_cap() then
      raise exception 'BB_GROUP_CAP';
    end if;
  end if;
  if v_balance < v_t.price then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  v_seller := public.bb_seller_name(v_s.profile_id, v_s.station_id);

  insert into public.blind_box_claims (
    assignment_id, type_id, type_name, seller_name, seller_profile_id, seller_station_id,
    spot, group_id, price, tokens, special, claimed_by, idempotency_key, status
  ) values (
    v_a.id, v_t.id, v_t.name, v_seller, v_s.profile_id, v_s.station_id,
    v_s.is_spot, v_group, v_t.price, null, v_t.is_special, auth.uid(), p_idempotency_key, 'owned'
  ) returning * into v_claim;

  insert into public.blind_box_claim_ranges (claim_id, min_tokens, max_tokens)
  values (v_claim.id, v_t.min_tokens, v_t.max_tokens);

  update public.blind_box_assignments set opened = opened + 1 where id = v_a.id;

  update public.groups set token_balance = token_balance - v_t.price
   where id = v_group returning token_balance into v_balance;

  if v_t.price <> 0 then
    v_station := coalesce(v_s.station_id,
      (select station_id from public.profiles where id = v_s.profile_id));
    insert into public.token_transactions (group_id, delta, reason, actor, station_id)
    values (v_group, -v_t.price,
            'Bought ' || v_t.name || ' blind box from ' || v_seller,
            auth.uid(), v_station);
  end if;

  perform public.audit('blindbox.buy', 'group:' || v_group,
    jsonb_build_object('claim', v_claim.id, 'assignment', v_a.id, 'type', v_t.id,
                       'seller', v_seller, 'price', v_t.price));

  return jsonb_build_object('ok', true, 'duplicate', false, 'claim_id', v_claim.id,
    'price', v_t.price, 'special', v_t.is_special,
    'seller_name', v_seller, 'type_name', v_t.name, 'balance', v_balance);
end;
$$;

-- ── 3. Reset: "Restore boxes" only ─────────────────────────────────────
-- Same as 0091 without the 'all' scope. Deleting the claims and setting
-- opened back to 0 also refills the Spot.

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
  v_refund boolean := coalesce(p_refund_tokens, true);
  v_token_reset timestamptz;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_scope is distinct from 'openings' then
    raise exception 'BB_RESET_SCOPE';
  end if;
  if not public.config_bool('rehearsal_mode', false) then
    raise exception 'BB_RESET_LOCKED';
  end if;
  if p_confirm is distinct from 'RESET' then
    raise exception 'BB_RESET_CONFIRM';
  end if;

  select count(*) into v_claims from public.blind_box_claims;

  select coalesce(max(created_at), '-infinity'::timestamptz) into v_token_reset
    from public.audit_log where action = 'tokens.reset';

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

  perform public.audit('blindbox.reset', 'blindbox',
    jsonb_build_object('scope', p_scope, 'claims', v_claims, 'tokens_put_back', v_refund,
                       'groups', v_groups, 'clamped', v_clamped, 'net_token_change', v_net));

  return jsonb_build_object('ok', true, 'scope', p_scope, 'claims', v_claims,
    'tokens_put_back', v_refund, 'groups', v_groups, 'clamped', v_clamped,
    'net_token_change', v_net);
end;
$$;
