-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0070: blind boxes — one QR per seller, BUY first, open later
--
-- Run AFTER 0054-0058 (this branch skips 0059-0069 on purpose: they live on
-- main, and 0070 is the next free number there).
--
-- Before: one QR per (seller, box type); tapping Open paid, rolled and
--         deducted in one step.
-- Now:
--   * ONE QR per seller (an account or a station). The code is the HMAC of
--     (seller id, qr_version) and stays valid until Admin regenerates it or
--     the seller runs out of boxes. If the seller has several box types with
--     stock, the buyer picks the type on the scan page.
--   * BUY (fn_bb_buy): charges the price, takes ONE box from the assignment's
--     stock and records an OWNED, unopened box for the group.
--   * OPEN (fn_bb_open, from the Items page): rolls the prize from the range
--     saved at BUY time and adds the tokens. Bought boxes can always be opened,
--     even when blind boxes are switched off or tokens are frozen.
--
-- blind_box_claims stays the table of boxes a group has BOUGHT. `status` says
-- whether the box is still 'owned' or already 'opened'. Limits (one box per
-- seller per group, group cap) count bought boxes, opened or not.
-- blind_box_assignments.opened therefore now means "sold" (bought).
--
-- ⚠ The old per-type QR links (token kind bb2) stop working. The old
--   fn_bb_preview / fn_open_blind_box functions are dropped.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 0. Safety guard ─────────────────────────────────────────────────────

do $$
begin
  if to_regclass('public.blind_box_sellers') is not null then
    raise exception 'Migration 0070 is already applied (public.blind_box_sellers exists).';
  end if;
  if to_regclass('public.blind_box_claims') is null then
    raise exception 'Run 0054 first: public.blind_box_claims does not exist.';
  end if;
end $$;

-- ── 1. Sellers: one row (and one QR version) per account / station ──────

create table public.blind_box_sellers (
  id          serial primary key,
  profile_id  uuid references public.profiles (id) on delete cascade,
  station_id  integer references public.stations (id) on delete cascade,
  qr_version  integer not null default 1,
  created_at  timestamptz not null default now(),
  constraint bb_seller_one_target check ((profile_id is null) <> (station_id is null))
);
create unique index blind_box_seller_profile_uq
  on public.blind_box_sellers (profile_id) where profile_id is not null;
create unique index blind_box_seller_station_uq
  on public.blind_box_sellers (station_id) where station_id is not null;

alter table public.blind_box_assignments
  add column seller_id integer references public.blind_box_sellers (id) on delete cascade;

-- Backfill from what is already assigned.
insert into public.blind_box_sellers (profile_id)
select distinct profile_id from public.blind_box_assignments where profile_id is not null;
insert into public.blind_box_sellers (station_id)
select distinct station_id from public.blind_box_assignments where station_id is not null;

update public.blind_box_assignments a
   set seller_id = s.id
  from public.blind_box_sellers s
 where (a.profile_id is not null and s.profile_id = a.profile_id)
    or (a.station_id is not null and s.station_id = a.station_id);

alter table public.blind_box_assignments alter column seller_id set not null;
create index blind_box_assign_seller_idx on public.blind_box_assignments (seller_id);

-- New assignments find (or create) their seller row.
create or replace function public.bb_assignment_seller()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.profile_id is not null then
    insert into public.blind_box_sellers (profile_id) values (new.profile_id)
    on conflict (profile_id) where profile_id is not null do nothing;
    select id into new.seller_id from public.blind_box_sellers where profile_id = new.profile_id;
  else
    insert into public.blind_box_sellers (station_id) values (new.station_id)
    on conflict (station_id) where station_id is not null do nothing;
    select id into new.seller_id from public.blind_box_sellers where station_id = new.station_id;
  end if;
  return new;
end;
$$;

create trigger blind_box_assignment_seller
  before insert on public.blind_box_assignments
  for each row execute function public.bb_assignment_seller();

alter table public.blind_box_sellers enable row level security;

create policy "admin reads sellers" on public.blind_box_sellers
  for select using (public.is_admin());
create policy "holder reads own seller" on public.blind_box_sellers
  for select using (
    public.bb_holder_role(public.my_role())
    and (
      profile_id = auth.uid()
      or (station_id is not null and station_id = public.bb_my_station_id())
    )
  );

-- ── 2. Claims become bought boxes (owned, then opened) ─────────────────

alter table public.blind_box_claims
  add column status    text not null default 'opened'
    check (status in ('owned', 'opened')),
  add column opened_at timestamptz,
  add column opened_by uuid references public.profiles (id);

update public.blind_box_claims set opened_at = created_at where opened_at is null;

alter table public.blind_box_claims alter column tokens drop not null;
alter table public.blind_box_claims
  add constraint bb_claim_tokens_when_opened
  check (status = 'owned' or tokens is not null);

create index blind_box_claim_group_status_idx
  on public.blind_box_claims (group_id, status);

-- The prize range is saved at BUY time but must stay hidden from Freshies, who
-- may read their own claim rows. No policy: only the security-definer
-- functions below read it.
create table public.blind_box_claim_ranges (
  claim_id    bigint primary key references public.blind_box_claims (id) on delete cascade,
  min_tokens  integer not null,
  max_tokens  integer not null,
  constraint bb_claim_range check (max_tokens >= min_tokens)
);
alter table public.blind_box_claim_ranges enable row level security;

-- Boxes bought before this migration are already opened: no range needed.

-- ── 3. Drop the old single-step flow ───────────────────────────────────

drop function if exists public.fn_bb_preview(integer, integer);
drop function if exists public.fn_open_blind_box(integer, integer, text);

-- ── 4. Regenerate now works per seller ─────────────────────────────────
-- Same signature (assignment id) so the Admin page keeps working: it bumps
-- the version of that assignment's seller, which kills the seller's one QR.

create or replace function public.fn_bb_regenerate(p_id integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_seller integer;
  v_version integer;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  select seller_id into v_seller from public.blind_box_assignments where id = p_id;
  if not found then
    raise exception 'BOX_UNKNOWN';
  end if;
  update public.blind_box_sellers set qr_version = qr_version + 1
   where id = v_seller returning qr_version into v_version;
  perform public.audit('blindbox.regenerate', 'seller:' || v_seller,
    jsonb_build_object('qr_version', v_version, 'via_assignment', p_id));
  return jsonb_build_object('ok', true, 'qr_version', v_version);
end;
$$;

-- ── 5. Scan page: what a Freshie sees (read-only) ──────────────────────
-- Never deducts anything and never reveals the prize range. A wrong or
-- regenerated code raises BOX_UNKNOWN; every other situation is a status.
--   status (whole page): ok | disabled | frozen | sold_out |
--                        already_from_seller | cap_reached
--   options[].status:    ok | sold_out | insufficient

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
  select count(*) into v_claims from public.blind_box_claims where group_id = v_group;

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
       and ((v_s.profile_id is not null and seller_profile_id = v_s.profile_id)
         or (v_s.station_id is not null and seller_station_id = v_s.station_id))
  ) then
    v_status := 'already_from_seller';
  elsif v_claims >= v_cap then
    v_status := 'cap_reached';
  elsif not exists (select 1 from jsonb_array_elements(v_options) o where o->>'status' <> 'sold_out') then
    v_status := 'sold_out';
  end if;

  return jsonb_build_object(
    'status', v_status,
    'seller_name', public.bb_seller_name(v_s.profile_id, v_s.station_id),
    'group_name', v_group_name,
    'balance', v_balance,
    'group_claims', v_claims,
    'cap', v_cap,
    'options', v_options
  );
end;
$$;

-- Logged-out visitors (an outside scanner) see WHO the code belongs to before
-- they pick their group and enter the group code. Only the seller's display
-- name is returned, and only for a valid code.
create or replace function public.fn_bb_seller_public(p_seller_id integer, p_version integer)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_s public.blind_box_sellers;
begin
  select * into v_s from public.blind_box_sellers where id = p_seller_id;
  if not found or v_s.qr_version is distinct from p_version then
    raise exception 'BOX_UNKNOWN';
  end if;
  return jsonb_build_object('seller_name', public.bb_seller_name(v_s.profile_id, v_s.station_id));
end;
$$;

-- ── 6. BUY: pay, take one box from stock, own it unopened ──────────────
-- The group row is locked first, then the assignment row, so a group's own
-- purchases (cap, one-per-seller, balance) and a seller's stock are both
-- serialised: simultaneous buys can never oversell a seller.

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
  -- lock the group first (then the assignment): a group's own purchases are
  -- serialised, so a retry that races the original finds it and cannot pay twice
  select token_balance into v_balance from public.groups where id = v_group for update;

  -- double-tap / retry: return the original purchase, charge nothing again
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
       and ((v_s.profile_id is not null and seller_profile_id = v_s.profile_id)
         or (v_s.station_id is not null and seller_station_id = v_s.station_id))
  ) then
    raise exception 'BB_ALREADY_FROM_SELLER';
  end if;
  select count(*) into v_claims from public.blind_box_claims where group_id = v_group;
  if v_claims >= public.bb_group_cap() then
    raise exception 'BB_GROUP_CAP';
  end if;
  if v_balance < v_t.price then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  v_seller := public.bb_seller_name(v_s.profile_id, v_s.station_id);

  insert into public.blind_box_claims (
    assignment_id, type_id, type_name, seller_name, seller_profile_id, seller_station_id,
    group_id, price, tokens, special, claimed_by, idempotency_key, status
  ) values (
    v_a.id, v_t.id, v_t.name, v_seller, v_s.profile_id, v_s.station_id,
    v_group, v_t.price, null, v_t.is_special, auth.uid(), p_idempotency_key, 'owned'
  ) returning * into v_claim;

  insert into public.blind_box_claim_ranges (claim_id, min_tokens, max_tokens)
  values (v_claim.id, v_t.min_tokens, v_t.max_tokens);

  update public.blind_box_assignments set opened = opened + 1 where id = v_a.id;

  update public.groups set token_balance = token_balance - v_t.price
   where id = v_group returning token_balance into v_balance;

  -- token_transactions forbids delta = 0 (a free box)
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

-- ── 7. OPEN: roll the prize of a box the group already owns ────────────
-- Allowed even when blind boxes are switched off or tokens are frozen: the
-- box is already paid for. Opening twice returns the same result.

create or replace function public.fn_bb_open(p_claim_id bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_group integer := public.my_group_id();
  v_claim public.blind_box_claims;
  v_range public.blind_box_claim_ranges;
  v_balance integer;
  v_tokens integer;
  v_station integer;
begin
  if public.my_role() is distinct from 'freshie' then
    raise exception 'FRESHIE_ONLY';
  end if;
  if v_group is null then
    raise exception 'NOT_IN_GROUP';
  end if;

  -- same lock order as fn_bb_buy: group first
  select token_balance into v_balance from public.groups where id = v_group for update;

  select * into v_claim from public.blind_box_claims
   where id = p_claim_id and group_id = v_group for update;
  if not found then
    raise exception 'BOX_UNKNOWN';
  end if;

  if v_claim.status = 'opened' then
    return jsonb_build_object('ok', true, 'duplicate', true, 'claim_id', v_claim.id,
      'tokens', v_claim.tokens, 'price', v_claim.price, 'special', v_claim.special,
      'seller_name', v_claim.seller_name, 'type_name', v_claim.type_name,
      'balance', v_balance);
  end if;

  select * into v_range from public.blind_box_claim_ranges where claim_id = v_claim.id;
  if not found then
    raise exception 'BOX_UNKNOWN';
  end if;

  v_tokens := v_range.min_tokens
              + floor(random() * (v_range.max_tokens - v_range.min_tokens + 1))::integer;

  update public.blind_box_claims
     set status = 'opened', tokens = v_tokens, opened_at = now(), opened_by = auth.uid()
   where id = v_claim.id;

  update public.groups set token_balance = token_balance + v_tokens
   where id = v_group returning token_balance into v_balance;

  if v_tokens <> 0 then
    v_station := coalesce(v_claim.seller_station_id,
      (select station_id from public.profiles where id = v_claim.seller_profile_id));
    insert into public.token_transactions (group_id, delta, reason, actor, station_id)
    values (v_group, v_tokens,
            'Opened ' || v_claim.type_name || ' blind box from ' || v_claim.seller_name
              || ' (won ' || v_tokens || ')',
            auth.uid(), v_station);
  end if;

  perform public.audit('blindbox.open', 'group:' || v_group,
    jsonb_build_object('claim', v_claim.id, 'tokens', v_tokens,
                       'type', v_claim.type_id, 'seller', v_claim.seller_name));

  return jsonb_build_object('ok', true, 'duplicate', false, 'claim_id', v_claim.id,
    'tokens', v_tokens, 'price', v_claim.price, 'special', v_claim.special,
    'seller_name', v_claim.seller_name, 'type_name', v_claim.type_name,
    'balance', v_balance);
end;
$$;

-- ── 8. Admin reset: bought-but-unopened boxes refund only their price ──
-- Same as 0058 except the net per group counts an unopened box as 0 won.

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
      select group_id, sum(coalesce(tokens, 0) - price)::integer as net
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

-- ── 9. Grants ──────────────────────────────────────────────────────────

revoke all on function public.fn_bb_seller_preview(integer, integer) from public, anon;
revoke all on function public.fn_bb_seller_public(integer, integer) from public;
revoke all on function public.fn_bb_buy(integer, integer, integer, text) from public, anon;
revoke all on function public.fn_bb_open(bigint) from public, anon;
revoke all on function public.fn_bb_regenerate(integer) from public, anon;
revoke all on function public.fn_bb_reset(text, text, boolean) from public, anon;

grant execute on function public.fn_bb_seller_preview(integer, integer) to authenticated;
grant execute on function public.fn_bb_seller_public(integer, integer) to anon, authenticated;
grant execute on function public.fn_bb_buy(integer, integer, integer, text) to authenticated;
grant execute on function public.fn_bb_open(bigint) to authenticated;
grant execute on function public.fn_bb_regenerate(integer) to authenticated;
grant execute on function public.fn_bb_reset(text, text, boolean) to authenticated;
