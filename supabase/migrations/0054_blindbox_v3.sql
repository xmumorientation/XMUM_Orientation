-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0054: blind boxes v3 — one system, managed from the Admin page
--
-- Replaces BOTH old blind-box systems (committee QR boxes from 0005/0007/0009
-- and the GM "Sell a blind box" button) with one model:
--
--   blind_box_types        Admin-defined box types: name, min/max tokens,
--                          price, total stock, special flag. Archived (not
--                          deleted) once they have been assigned.
--   blind_box_assignments  A type handed to ONE seller: an account (any
--                          gm / guardian_gm / committee / hof / hogm / admin)
--                          or a STATION (its GMs share one pool). Holds the
--                          quantity, how many were opened, and qr_version.
--   blind_box_claims       One row per opened box (history + the limits).
--
-- How a Freshie gets a box:
--   1. Scans the seller's QR (link = /blindbox?t=<token>). The token is an
--      HMAC of (assignment id, qr_version): it is recomputed on demand and
--      never stored, so Admin can preview any link without invalidating it.
--      "Regenerate" bumps qr_version and kills the old QR.
--   2. fn_bb_preview shows seller, type, price, balance. NOTHING is deducted.
--   3. Tapping Open runs fn_open_blind_box: price is paid, the prize is
--      rolled, ONE box is deducted from the assignment.
--
-- Limits (all per GROUP, not per person), enforced in the database:
--   * one claim per group per seller (unique indexes on blind_box_claims)
--   * at most game_config 'blindbox_group_cap' claims per group (default 4)
--
-- ⚠ This DROPS the old blind-box tables. It aborts if any claim or sale
--   exists. If those are only test rows, clear them first:
--     delete from public.blind_box_claims;
--     delete from public.blind_box_sales;
--
-- ⚠ Deploy order: run this migration, then ship the app code. The old app
--   code calls tables and functions that no longer exist after this runs.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 0. Safety guard ─────────────────────────────────────────────────────

do $$
declare
  v_claims bigint;
  v_sales bigint;
begin
  if to_regclass('public.blind_box_types') is not null then
    raise exception 'Migration 0054 is already applied (public.blind_box_types exists). Do not run it again: it would drop the live blind-box tables.';
  end if;
  select count(*) into v_claims from public.blind_box_claims;
  select count(*) into v_sales from public.blind_box_sales;
  if v_claims > 0 or v_sales > 0 then
    raise exception
      'Blind box rebuild aborted: % claim(s) and % sale(s) exist. If they are test rows, run: delete from public.blind_box_claims; delete from public.blind_box_sales; then re-run this migration.',
      v_claims, v_sales;
  end if;
end $$;

-- ── 1. Remove the old system ────────────────────────────────────────────

drop function if exists public.fn_scan_blind_box(text);
drop function if exists public.fn_sell_blind_box(integer, text);

drop table if exists public.blind_box_claims;
drop table if exists public.blind_box_sales;
drop table if exists public.blind_box_allocations;

delete from public.game_config
 where key in ('gm_blindbox_price', 'gm_blindbox_min', 'gm_blindbox_max', 'gm_blindbox_stock');

insert into public.game_config (key, value)
values ('blindbox_group_cap', '4')
on conflict (key) do nothing;

-- ── 2. Helpers ──────────────────────────────────────────────────────────

-- Who may hold boxes: everyone except facilitators and freshies.
create or replace function public.bb_holder_role(p_role public.user_role)
returns boolean
language sql immutable
as $$
  select p_role in ('gm', 'guardian_gm', 'committee', 'hof', 'hogm', 'admin');
$$;

create or replace function public.bb_my_station_id()
returns integer
language sql stable security definer set search_path = public
as $$
  select station_id from public.profiles where id = auth.uid();
$$;

create or replace function public.bb_group_cap()
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select (value #>> '{}')::integer from public.game_config where key = 'blindbox_group_cap'),
    4
  );
$$;

-- ── 3. Tables ───────────────────────────────────────────────────────────

create table public.blind_box_types (
  id          serial primary key,
  name        text not null,
  min_tokens  integer not null default 1 check (min_tokens >= 0),
  max_tokens  integer not null default 2,
  price       integer not null default 0 check (price >= 0),
  -- total boxes of this type that exist; assignments are drawn from it
  stock       integer not null default 0 check (stock >= 0),
  is_special  boolean not null default false,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint bb_type_range check (max_tokens >= min_tokens)
);

-- Names are unique among live types, so an archived "Normal" does not block a
-- new "Normal".
create unique index blind_box_types_name_uq
  on public.blind_box_types (lower(name)) where not archived;

create table public.blind_box_assignments (
  id          serial primary key,
  type_id     integer not null references public.blind_box_types (id) on delete restrict,
  -- exactly one of these is set: the seller is an account OR a station
  profile_id  uuid references public.profiles (id) on delete cascade,
  station_id  integer references public.stations (id) on delete cascade,
  quantity    integer not null check (quantity >= 0),
  opened      integer not null default 0 check (opened >= 0),
  qr_version  integer not null default 1,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint bb_assign_one_target check ((profile_id is null) <> (station_id is null)),
  constraint bb_assign_opened_le_qty check (opened <= quantity)
);

create unique index blind_box_assign_profile_uq
  on public.blind_box_assignments (type_id, profile_id) where profile_id is not null;
create unique index blind_box_assign_station_uq
  on public.blind_box_assignments (type_id, station_id) where station_id is not null;
create index blind_box_assign_type_idx on public.blind_box_assignments (type_id);

create table public.blind_box_claims (
  id                 bigserial primary key,
  assignment_id      integer references public.blind_box_assignments (id) on delete set null,
  -- snapshots: history stays readable after a type is edited or archived
  type_id            integer not null,
  type_name          text not null,
  seller_name        text not null,
  seller_profile_id  uuid,
  seller_station_id  integer,
  group_id           integer not null references public.groups (id),
  price              integer not null,
  tokens             integer not null,
  special            boolean not null default false,
  claimed_by         uuid references public.profiles (id),
  idempotency_key    text unique,
  created_at         timestamptz not null default now(),
  constraint bb_claim_one_seller check ((seller_profile_id is null) <> (seller_station_id is null))
);

-- One claim per group per seller (a station counts as ONE seller however many
-- GMs share it). Backs the check in fn_open_blind_box.
create unique index blind_box_claim_group_profile_uq
  on public.blind_box_claims (group_id, seller_profile_id) where seller_profile_id is not null;
create unique index blind_box_claim_group_station_uq
  on public.blind_box_claims (group_id, seller_station_id) where seller_station_id is not null;
create index blind_box_claim_group_idx on public.blind_box_claims (group_id);

-- ── 4. Row level security (writes only through the RPCs below) ──────────

alter table public.blind_box_types       enable row level security;
alter table public.blind_box_assignments enable row level security;
alter table public.blind_box_claims      enable row level security;

-- Types carry the min/max range, so Freshies cannot read them; they only see
-- what fn_bb_preview returns.
create policy "admin manages box types" on public.blind_box_types
  for all using (public.is_admin()) with check (public.is_admin());
create policy "holders read box types" on public.blind_box_types
  for select using (public.bb_holder_role(public.my_role()));

create policy "admin reads assignments" on public.blind_box_assignments
  for select using (public.is_admin());
create policy "holder reads own assignments" on public.blind_box_assignments
  for select using (
    public.bb_holder_role(public.my_role())
    and (
      profile_id = auth.uid()
      or (station_id is not null and station_id = public.bb_my_station_id())
    )
  );

create policy "committee reads all claims" on public.blind_box_claims
  for select using (public.is_committee());
create policy "group reads own claims" on public.blind_box_claims
  for select using (group_id = public.my_group_id());

-- ── 5. Admin RPCs ───────────────────────────────────────────────────────

-- Create (p_id null) or edit a box type. Lowering stock below what is already
-- assigned is refused. Edits to range / price apply to future claims only.
create or replace function public.fn_bb_type_save(
  p_id integer,
  p_name text,
  p_min integer,
  p_max integer,
  p_price integer,
  p_stock integer,
  p_special boolean
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id integer;
  v_assigned bigint;
  v_archived boolean;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if v_name = '' then
    raise exception 'BB_TYPE_NAME_MISSING';
  end if;
  if p_min is null or p_max is null or p_price is null or p_stock is null
     or p_min < 0 or p_max < p_min or p_price < 0 or p_stock < 0 then
    raise exception 'BB_RANGE_INVALID';
  end if;

  begin
    if p_id is null then
      insert into public.blind_box_types (name, min_tokens, max_tokens, price, stock, is_special)
      values (v_name, p_min, p_max, p_price, p_stock, coalesce(p_special, false))
      returning id into v_id;
    else
      select archived into v_archived from public.blind_box_types where id = p_id for update;
      if not found then
        raise exception 'BB_TYPE_NOT_FOUND';
      end if;
      if v_archived then
        raise exception 'BB_TYPE_ARCHIVED';
      end if;
      select coalesce(sum(quantity), 0) into v_assigned
        from public.blind_box_assignments where type_id = p_id;
      if p_stock < v_assigned then
        raise exception 'BB_STOCK_BELOW_ASSIGNED: % already assigned', v_assigned;
      end if;
      update public.blind_box_types
         set name = v_name, min_tokens = p_min, max_tokens = p_max,
             price = p_price, stock = p_stock, is_special = coalesce(p_special, false)
       where id = p_id;
      v_id := p_id;
    end if;
  exception when unique_violation then
    raise exception 'BB_TYPE_EXISTS';
  end;

  perform public.audit('blindbox.type_save', 'type:' || v_id,
    jsonb_build_object('name', v_name, 'min', p_min, 'max', p_max,
                       'price', p_price, 'stock', p_stock,
                       'special', coalesce(p_special, false), 'created', p_id is null));
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Delete a type. If it has ever been assigned it is ARCHIVED instead: it
-- disappears from new assignments, its QRs stop working, history is kept.
create or replace function public.fn_bb_type_delete(p_id integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  select name into v_name from public.blind_box_types where id = p_id for update;
  if not found then
    raise exception 'BB_TYPE_NOT_FOUND';
  end if;

  if exists (select 1 from public.blind_box_assignments where type_id = p_id) then
    update public.blind_box_assignments set active = false where type_id = p_id;
    update public.blind_box_types set archived = true where id = p_id;
    perform public.audit('blindbox.type_archive', 'type:' || p_id,
      jsonb_build_object('name', v_name));
    return jsonb_build_object('ok', true, 'archived', true);
  end if;

  delete from public.blind_box_types where id = p_id;
  perform public.audit('blindbox.type_delete', 'type:' || p_id,
    jsonb_build_object('name', v_name));
  return jsonb_build_object('ok', true, 'archived', false);
end;
$$;

-- Give boxes to sellers. p_quantity is ADDED to what each seller already
-- holds. Exactly one way of choosing sellers:
--   p_role          every account with that role (a snapshot of today's list)
--   p_profile_ids   these accounts
--   p_station_ids   these stations (their GMs share the pool)
--   p_all_stations  every station
-- All-or-nothing: if stock cannot cover quantity x sellers, nothing is
-- assigned and the shortfall is reported.
create or replace function public.fn_bb_assign(
  p_type_id integer,
  p_quantity integer,
  p_role public.user_role default null,
  p_profile_ids uuid[] default null,
  p_station_ids integer[] default null,
  p_all_stations boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_type public.blind_box_types;
  v_modes integer;
  v_profiles uuid[];
  v_stations integer[];
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

  v_modes := (case when p_role is not null then 1 else 0 end)
           + (case when p_profile_ids is not null then 1 else 0 end)
           + (case when p_station_ids is not null then 1 else 0 end)
           + (case when coalesce(p_all_stations, false) then 1 else 0 end);
  if v_modes <> 1 then
    raise exception 'BB_TARGET_INVALID';
  end if;

  select * into v_type from public.blind_box_types where id = p_type_id for update;
  if not found then
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
  elsif p_profile_ids is not null then
    select array_agg(id) into v_profiles
      from public.profiles
     where id = any (p_profile_ids) and public.bb_holder_role(role);
    if coalesce(cardinality(v_profiles), 0) <> cardinality(p_profile_ids) then
      raise exception 'BB_TARGET_INVALID';
    end if;
  elsif p_station_ids is not null then
    select array_agg(id) into v_stations from public.stations where id = any (p_station_ids);
    if coalesce(cardinality(v_stations), 0) <> cardinality(p_station_ids) then
      raise exception 'BB_TARGET_INVALID';
    end if;
  else
    select array_agg(id) into v_stations from public.stations;
  end if;

  v_count := coalesce(cardinality(v_profiles), 0) + coalesce(cardinality(v_stations), 0);
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

  if v_profiles is not null then
    insert into public.blind_box_assignments (type_id, profile_id, quantity)
    select p_type_id, p, p_quantity from unnest(v_profiles) as p
    on conflict (type_id, profile_id) where profile_id is not null
    do update set quantity = public.blind_box_assignments.quantity + excluded.quantity;
  end if;
  if v_stations is not null then
    insert into public.blind_box_assignments (type_id, station_id, quantity)
    select p_type_id, s, p_quantity from unnest(v_stations) as s
    on conflict (type_id, station_id) where station_id is not null
    do update set quantity = public.blind_box_assignments.quantity + excluded.quantity;
  end if;

  perform public.audit('blindbox.assign', 'type:' || p_type_id,
    jsonb_build_object('quantity_each', p_quantity, 'sellers', v_count,
                       'total', v_need, 'role', p_role,
                       'all_stations', coalesce(p_all_stations, false)));
  return jsonb_build_object('ok', true, 'sellers', v_count, 'added', v_need,
                            'left', v_left - v_need);
end;
$$;

-- Set one assignment's total quantity (reduce, top up, or remove at 0).
-- Cannot go below what was already opened; unopened boxes return to stock.
create or replace function public.fn_bb_set_quantity(p_assignment_id integer, p_quantity integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_a public.blind_box_assignments;
  v_type public.blind_box_types;
  v_assigned bigint;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'BB_RANGE_INVALID';
  end if;

  select * into v_a from public.blind_box_assignments where id = p_assignment_id;
  if not found then
    raise exception 'BOX_UNKNOWN';
  end if;
  -- lock the type first so concurrent stock maths are serialised
  select * into v_type from public.blind_box_types where id = v_a.type_id for update;
  select * into v_a from public.blind_box_assignments where id = p_assignment_id for update;

  if p_quantity < v_a.opened then
    raise exception 'BB_QTY_BELOW_OPENED: % already opened', v_a.opened;
  end if;
  select coalesce(sum(quantity), 0) into v_assigned
    from public.blind_box_assignments where type_id = v_a.type_id;
  if p_quantity - v_a.quantity > v_type.stock - v_assigned then
    raise exception 'BB_NOT_ENOUGH_STOCK: need % more but only % left',
      p_quantity - v_a.quantity, v_type.stock - v_assigned;
  end if;

  if p_quantity = 0 and v_a.opened = 0 then
    delete from public.blind_box_assignments where id = p_assignment_id;
  else
    update public.blind_box_assignments set quantity = p_quantity where id = p_assignment_id;
  end if;

  perform public.audit('blindbox.set_quantity', 'assignment:' || p_assignment_id,
    jsonb_build_object('from', v_a.quantity, 'to', p_quantity));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fn_bb_assignment_set_active(p_id integer, p_active boolean)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  update public.blind_box_assignments set active = coalesce(p_active, false) where id = p_id;
  if not found then
    raise exception 'BOX_UNKNOWN';
  end if;
  perform public.audit('blindbox.set_active', 'assignment:' || p_id,
    jsonb_build_object('active', coalesce(p_active, false)));
  return jsonb_build_object('ok', true);
end;
$$;

-- Invalidate the assignment's current QR. The new link is the same kind of
-- token with the next qr_version; claims already made are unaffected.
create or replace function public.fn_bb_regenerate(p_id integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_version integer;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  update public.blind_box_assignments set qr_version = qr_version + 1
   where id = p_id returning qr_version into v_version;
  if not found then
    raise exception 'BOX_UNKNOWN';
  end if;
  perform public.audit('blindbox.regenerate', 'assignment:' || p_id,
    jsonb_build_object('qr_version', v_version));
  return jsonb_build_object('ok', true, 'qr_version', v_version);
end;
$$;

-- ── 6. Freshie RPCs ─────────────────────────────────────────────────────

-- Display name of an assignment's seller.
create or replace function public.bb_seller_name(p_profile_id uuid, p_station_id integer)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when p_profile_id is not null
      then coalesce((select nullif(full_name, '') from public.profiles where id = p_profile_id), 'Committee')
    else coalesce((select name from public.stations where id = p_station_id), 'Station')
  end;
$$;

-- Read-only: what a Freshie sees after scanning, BEFORE tapping Open. Never
-- deducts anything and never reveals the min/max range. Bad / revoked /
-- archived codes raise BOX_UNKNOWN; every other situation is reported as a
-- status so the page can explain it.
create or replace function public.fn_bb_preview(p_assignment_id integer, p_version integer)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_group integer := public.my_group_id();
  v_a public.blind_box_assignments;
  v_t public.blind_box_types;
  v_balance integer;
  v_claims integer;
  v_cap integer := public.bb_group_cap();
  v_status text := 'ok';
begin
  if public.my_role() <> 'freshie' then
    raise exception 'FRESHIE_ONLY';
  end if;
  if v_group is null then
    raise exception 'NOT_IN_GROUP';
  end if;

  select * into v_a from public.blind_box_assignments where id = p_assignment_id;
  if not found or v_a.qr_version is distinct from p_version or not v_a.active then
    raise exception 'BOX_UNKNOWN';
  end if;
  select * into v_t from public.blind_box_types where id = v_a.type_id;
  if v_t.archived then
    raise exception 'BOX_UNKNOWN';
  end if;

  select token_balance into v_balance from public.groups where id = v_group;
  select count(*) into v_claims from public.blind_box_claims where group_id = v_group;

  if public.config_bool('blindbox_disabled', false) then
    v_status := 'disabled';
  elsif public.config_bool('tokens_frozen', false) then
    v_status := 'frozen';
  elsif v_a.opened >= v_a.quantity then
    v_status := 'sold_out';
  elsif exists (
    select 1 from public.blind_box_claims
     where group_id = v_group
       and ((v_a.profile_id is not null and seller_profile_id = v_a.profile_id)
         or (v_a.station_id is not null and seller_station_id = v_a.station_id))
  ) then
    v_status := 'already_from_seller';
  elsif v_claims >= v_cap then
    v_status := 'cap_reached';
  elsif v_balance < v_t.price then
    v_status := 'insufficient';
  end if;

  return jsonb_build_object(
    'status', v_status,
    'seller_name', public.bb_seller_name(v_a.profile_id, v_a.station_id),
    'type_name', v_t.name,
    'price', v_t.price,
    'special', v_t.is_special,
    'balance', v_balance,
    'group_claims', v_claims,
    'cap', v_cap
  );
end;
$$;

-- Pay the price, roll the prize, deduct ONE box. The group row is locked
-- first, so a group's claims (cap, one-per-seller, balance) are serialised.
create or replace function public.fn_open_blind_box(
  p_assignment_id integer,
  p_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_group integer := public.my_group_id();
  v_a public.blind_box_assignments;
  v_t public.blind_box_types;
  v_claim public.blind_box_claims;
  v_balance integer;
  v_claims integer;
  v_seller text;
  v_tokens integer;
  v_delta integer;
  v_station integer;
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

  -- double-tap / retry: return the original result, charge nothing again
  if p_idempotency_key is not null then
    select * into v_claim from public.blind_box_claims where idempotency_key = p_idempotency_key;
    if found then
      select token_balance into v_balance from public.groups where id = v_group;
      return jsonb_build_object('ok', true, 'duplicate', true,
        'tokens', v_claim.tokens, 'price', v_claim.price, 'special', v_claim.special,
        'seller_name', v_claim.seller_name, 'type_name', v_claim.type_name,
        'balance', v_balance);
    end if;
  end if;

  -- lock order: group, then assignment (nothing else takes both)
  select token_balance into v_balance from public.groups where id = v_group for update;

  select * into v_a from public.blind_box_assignments where id = p_assignment_id for update;
  if not found or v_a.qr_version is distinct from p_version or not v_a.active then
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
       and ((v_a.profile_id is not null and seller_profile_id = v_a.profile_id)
         or (v_a.station_id is not null and seller_station_id = v_a.station_id))
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

  v_tokens := v_t.min_tokens + floor(random() * (v_t.max_tokens - v_t.min_tokens + 1))::integer;
  v_seller := public.bb_seller_name(v_a.profile_id, v_a.station_id);
  v_delta := v_tokens - v_t.price;

  insert into public.blind_box_claims (
    assignment_id, type_id, type_name, seller_name, seller_profile_id, seller_station_id,
    group_id, price, tokens, special, claimed_by, idempotency_key
  ) values (
    v_a.id, v_t.id, v_t.name, v_seller, v_a.profile_id, v_a.station_id,
    v_group, v_t.price, v_tokens, v_t.is_special, auth.uid(), p_idempotency_key
  );

  update public.blind_box_assignments set opened = opened + 1 where id = v_a.id;

  update public.groups set token_balance = token_balance + v_delta
   where id = v_group returning token_balance into v_balance;

  -- token_transactions forbids delta = 0 (price == prize); the claim row
  -- already records that case.
  if v_delta <> 0 then
    v_station := coalesce(v_a.station_id,
      (select station_id from public.profiles where id = v_a.profile_id));
    insert into public.token_transactions (group_id, delta, reason, actor, station_id)
    values (v_group, v_delta,
            'Blind box from ' || v_seller || ' (paid ' || v_t.price || ', won ' || v_tokens || ')',
            auth.uid(), v_station);
  end if;

  perform public.audit('blindbox.claim', 'group:' || v_group,
    jsonb_build_object('assignment', v_a.id, 'type', v_t.id, 'seller', v_seller,
                       'price', v_t.price, 'tokens', v_tokens, 'special', v_t.is_special));

  return jsonb_build_object('ok', true, 'duplicate', false,
    'tokens', v_tokens, 'price', v_t.price, 'special', v_t.is_special,
    'seller_name', v_seller, 'type_name', v_t.name, 'balance', v_balance);
end;
$$;

-- ── 7. Live ops: the control-room counters read the new tables ─────────

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
    'blindbox_claims',       (select count(*) from public.blind_box_claims),
    'blindbox_tokens_in',    (select coalesce(sum(price), 0) from public.blind_box_claims),
    'pieces_granted',        (select count(*) from public.inventory where item_type = 'puzzle'),
    'sets_redeemed',         (select count(*) from public.puzzle_redemptions),
    'projectors_activated',  (select count(*) from public.projectors where activated_at is not null)
  ) into v;
  return v;
end;
$$;

-- ── 8. Grants + realtime ────────────────────────────────────────────────

revoke all on function public.fn_bb_type_save(integer, text, integer, integer, integer, integer, boolean) from public, anon;
revoke all on function public.fn_bb_type_delete(integer) from public, anon;
revoke all on function public.fn_bb_assign(integer, integer, public.user_role, uuid[], integer[], boolean) from public, anon;
revoke all on function public.fn_bb_set_quantity(integer, integer) from public, anon;
revoke all on function public.fn_bb_assignment_set_active(integer, boolean) from public, anon;
revoke all on function public.fn_bb_regenerate(integer) from public, anon;
revoke all on function public.fn_bb_preview(integer, integer) from public, anon;
revoke all on function public.fn_open_blind_box(integer, integer, text) from public, anon;

grant execute on function public.fn_bb_type_save(integer, text, integer, integer, integer, integer, boolean) to authenticated;
grant execute on function public.fn_bb_type_delete(integer) to authenticated;
grant execute on function public.fn_bb_assign(integer, integer, public.user_role, uuid[], integer[], boolean) to authenticated;
grant execute on function public.fn_bb_set_quantity(integer, integer) to authenticated;
grant execute on function public.fn_bb_assignment_set_active(integer, boolean) to authenticated;
grant execute on function public.fn_bb_regenerate(integer) to authenticated;
grant execute on function public.fn_bb_preview(integer, integer) to authenticated;
grant execute on function public.fn_open_blind_box(integer, integer, text) to authenticated;

alter publication supabase_realtime add table
  public.blind_box_types,
  public.blind_box_assignments,
  public.blind_box_claims;
