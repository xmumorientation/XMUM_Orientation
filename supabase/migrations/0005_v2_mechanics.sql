-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0005: Game mechanics v2 (post-HOGM redesign, July 2026)
--
--  * Puzzle sets grow from 3 → 5 pieces per location
--  * Day 2 stations get risk tiers (low/medium/high, entry 2/4/6 tokens);
--    the system deducts the fee and auto-grants a random NON-DUPLICATE
--    piece from the tier's location pool
--  * Gacha (Idea 1/Idea 2, facility cards, Gala Night) is RETIRED,
--    replaced by the Blind Box system: committee members carry personal
--    QR codes (tokens only, per-group once per member), plus a limited
--    GM-sold box; all amounts/counts Admin-configurable
--  * Puzzle pictures: admin uploads one image per location, the app
--    slices it into 5 pieces client-side
--  * Event branding (name/colours) becomes runtime config so future
--    orientations can rebrand without code changes ("Vortexa" this year)
--  * New content tables: schedule_items, faq_items
--
-- Run AFTER 0001–0004. Wipes existing TEST game data (inventory, txs,
-- draws, redemptions) — keeps accounts, groups, stations.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 0. Wipe smoke-test game state (accounts/groups/stations survive) ────

delete from public.gacha_draws;
delete from public.inventory;
delete from public.puzzle_redemptions;
delete from public.token_transactions;
update public.groups set token_balance = 0;

-- Retire the gacha pools (tables stay for audit/history; pools emptied)
delete from public.gacha_pool_entries;
delete from public.gacha_pools;

-- Remove retired item types (facility cards & clue card)
delete from public.items where type = 'facility_card';

-- ── 1. Puzzle sets: 5 pieces per location ────────────────────────────────

alter table public.items drop constraint if exists items_puzzle_index_check;
alter table public.items add constraint items_puzzle_index_check
  check (puzzle_index between 1 and 5);

insert into public.items (type, name, description, puzzle_location, puzzle_index)
select 'puzzle',
       loc || ' Puzzle Piece ' || idx,
       'Fragment ' || idx || ' of the ' || loc || ' projector blueprint',
       loc::public.projector_location,
       idx
from (values ('B1'), ('A3'), ('TF')) as l(loc),
     (values (4), (5)) as i(idx)
on conflict do nothing;

-- ── 2. Station risk tiers (Day 2) ────────────────────────────────────────

create type public.risk_tier as enum ('low', 'medium', 'high');

alter table public.stations
  add column if not exists risk_tier public.risk_tier not null default 'low',
  add column if not exists entry_cost integer not null default 2 check (entry_cost >= 0);

-- Seed tiers: 6 easy / 4 medium / 2 hard (HOGM spec) — Admin-editable.
update public.stations set risk_tier = 'low',    entry_cost = 2 where id in (1,2,3,4,5,6);
update public.stations set risk_tier = 'medium', entry_cost = 4 where id in (7,8,9,10);
update public.stations set risk_tier = 'high',   entry_cost = 6 where id in (11,12);

-- ── 3. Blind boxes ───────────────────────────────────────────────────────

-- One row per committee member who carries boxes. Hash-only, like NFC
-- tokens: the signed token is never stored — it is minted on demand and
-- returned exactly once by POST /api/blindbox/qr, which rotates qr_hash
-- (each rotation invalidates the member's previous QR). See 0007.
create table public.blind_box_allocations (
  id          serial primary key,
  profile_id  uuid not null unique references public.profiles (id) on delete cascade,
  qr_hash     text not null unique,
  box_type    text not null default 'normal' check (box_type in ('normal', 'special')),
  min_tokens  integer not null default 1 check (min_tokens >= 0),
  max_tokens  integer not null default 2 check (max_tokens >= min_tokens),
  total_boxes integer not null default 2 check (total_boxes >= 0),
  used_boxes  integer not null default 0 check (used_boxes >= 0 and used_boxes <= total_boxes),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.blind_box_claims (
  id            bigserial primary key,
  allocation_id integer not null references public.blind_box_allocations (id) on delete cascade,
  group_id      integer not null references public.groups (id),
  tokens        integer not null,
  claimed_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  -- each group may claim from a given committee member exactly once
  unique (allocation_id, group_id)
);

-- GM-sold boxes (limited global stock; price/range in game_config)
create table public.blind_box_sales (
  id         bigserial primary key,
  group_id   integer not null references public.groups (id),
  price      integer not null,
  tokens     integer not null,
  actor      uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.blind_box_allocations enable row level security;
alter table public.blind_box_claims      enable row level security;
alter table public.blind_box_sales       enable row level security;

-- committee members see their own allocation; admin sees/manages all
create policy "own allocation" on public.blind_box_allocations
  for select using (profile_id = auth.uid());
create policy "admin manages allocations" on public.blind_box_allocations
  for all using (public.is_admin()) with check (public.is_admin());

create policy "member reads own claims" on public.blind_box_claims
  for select using (
    allocation_id in (select id from public.blind_box_allocations where profile_id = auth.uid())
  );
create policy "group reads own claims" on public.blind_box_claims
  for select using (group_id = public.my_group_id());
create policy "committee reads all claims" on public.blind_box_claims
  for select using (public.is_committee());

create policy "group reads own purchases" on public.blind_box_sales
  for select using (group_id = public.my_group_id());
create policy "staff read sales" on public.blind_box_sales
  for select using (public.my_role() in ('gm', 'guardian_gm') or public.is_committee());

-- ── 4. Schedule & FAQ content ────────────────────────────────────────────

create table public.schedule_items (
  id          serial primary key,
  day_label   text not null,           -- "Day 1" / "Day 2" / "Pre-Orientation"
  time_label  text not null,           -- "09:00 – 10:30"
  title       text not null,
  location    text not null default '',
  description text not null default '',
  sort_order  integer not null default 0
);

create table public.faq_items (
  id         serial primary key,
  category   text not null default 'General',
  question   text not null,
  answer     text not null,
  sort_order integer not null default 0
);

alter table public.schedule_items enable row level security;
alter table public.faq_items      enable row level security;

create policy "all read schedule" on public.schedule_items
  for select using (auth.uid() is not null);
create policy "admin manages schedule" on public.schedule_items
  for all using (public.is_admin()) with check (public.is_admin());

create policy "all read faq" on public.faq_items
  for select using (auth.uid() is not null);
create policy "admin manages faq" on public.faq_items
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 5. Puzzle image storage bucket ───────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('puzzle-images', 'puzzle-images', true)
on conflict (id) do nothing;

create policy "public read puzzle images" on storage.objects
  for select using (bucket_id = 'puzzle-images');
create policy "admin writes puzzle images" on storage.objects
  for insert with check (bucket_id = 'puzzle-images' and public.is_admin());
create policy "admin updates puzzle images" on storage.objects
  for update using (bucket_id = 'puzzle-images' and public.is_admin());
create policy "admin deletes puzzle images" on storage.objects
  for delete using (bucket_id = 'puzzle-images' and public.is_admin());

-- ── 6. Config: branding + blind box + puzzle images ─────────────────────

insert into public.game_config (key, value) values
  ('event_name',        '"Vortexa"'),
  ('event_tagline',     '"XMUM Orientation 2026"'),
  ('brand_primary',     '"#0891b2"'),   -- accent 1 (CTA gradient start)
  ('brand_secondary',   '"#7c3aed"'),   -- accent 2 (CTA gradient end)
  ('gm_blindbox_price', '2'),
  ('gm_blindbox_min',   '1'),
  ('gm_blindbox_max',   '2'),
  ('gm_blindbox_stock', '8'),
  ('puzzle_image_B1',   'null'),
  ('puzzle_image_A3',   'null'),
  ('puzzle_image_TF',   'null')
on conflict (key) do nothing;

-- ── 7. Functions ─────────────────────────────────────────────────────────

-- Pieces per set is now derived from items, so 5-piece sets & future
-- changes need no function edits.
create or replace function public.fn_puzzle_status(p_group_id integer, p_location public.projector_location)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_owned integer;
  v_total integer;
  v_redeemed boolean;
  v_activated boolean;
begin
  if public.my_role() not in ('gm', 'guardian_gm', 'hof', 'hogm', 'committee', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;

  select count(*) into v_total
    from public.items where type = 'puzzle' and puzzle_location = p_location;

  select count(distinct i.puzzle_index) into v_owned
    from public.inventory inv
    join public.items i on i.id = inv.item_id
   where inv.group_id = p_group_id and i.type = 'puzzle' and i.puzzle_location = p_location;

  v_redeemed := exists (select 1 from public.puzzle_redemptions
                         where group_id = p_group_id and location = p_location);
  v_activated := exists (select 1 from public.projectors
                          where location = p_location and activated_at is not null);

  return jsonb_build_object('pieces', v_owned, 'total', v_total,
                            'complete', v_owned >= v_total,
                            'redeemed', v_redeemed, 'projector_activated', v_activated);
end;
$$;

-- Day 2 challenge submission (HOGM v2 core loop).
-- GM picks: group, success/fail, and location choice(s) per their
-- station's tier (low: none, medium: exactly 2, high: exactly 1).
-- Atomic: deduct entry fee → if success, grant one RANDOM piece the
-- group doesn't own yet from the allowed pool. Fee is charged win or
-- lose (it's the entry fee). If the group already owns every piece in
-- the pool, the call fails BEFORE charging (POOL_EXHAUSTED).
create or replace function public.fn_day2_challenge(
  p_group_id integer,
  p_success boolean,
  p_locations public.projector_location[],
  p_idempotency_key text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.user_role := public.my_role();
  v_station record;
  v_pool public.projector_location[];
  -- typed %rowtype (not a bare `record`) so it has a known, all-NULL
  -- structure even when p_success is false and it's never assigned —
  -- referencing fields of an unassigned bare `record` raises
  -- "record ... is not assigned yet" even inside a CASE WHEN that
  -- shouldn't evaluate that branch.
  v_item public.items%rowtype;
  v_balance integer;
  v_tx_id bigint;
begin
  if v_role not in ('gm', 'guardian_gm', 'hof', 'hogm', 'admin') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if public.config_bool('tokens_frozen', false) then
    raise exception 'TOKENS_FROZEN';
  end if;
  if v_role <> 'admin'
     and not (public.phase_active('day2') or public.phase_active('endgame')) then
    raise exception 'PHASE_LOCKED';
  end if;

  -- idempotency (double-tap / offline retry)
  if p_idempotency_key is not null then
    select id into v_tx_id from public.token_transactions
      where idempotency_key = p_idempotency_key;
    if found then
      select token_balance into v_balance from public.groups where id = p_group_id;
      return jsonb_build_object('ok', true, 'duplicate', true, 'balance', v_balance);
    end if;
  end if;

  -- the GM's own station decides tier & cost (admins may pass any station via profile)
  select s.* into v_station
    from public.stations s
    join public.profiles p on p.station_id = s.id
   where p.id = auth.uid();
  if not found then
    raise exception 'NO_STATION_ASSIGNED';
  end if;

  -- location pool per tier
  if v_station.risk_tier = 'low' then
    v_pool := array['B1','A3','TF']::public.projector_location[];
  elsif v_station.risk_tier = 'medium' then
    if p_locations is null or array_length(p_locations, 1) <> 2 then
      raise exception 'NEED_TWO_LOCATIONS';
    end if;
    v_pool := p_locations;
  else
    if p_locations is null or array_length(p_locations, 1) <> 1 then
      raise exception 'NEED_ONE_LOCATION';
    end if;
    v_pool := p_locations;
  end if;

  -- on success, make sure the pool still has an unowned piece BEFORE charging
  if p_success then
    select i.* into v_item
      from public.items i
     where i.type = 'puzzle'
       and i.puzzle_location = any (v_pool)
       and not exists (
         select 1 from public.inventory inv
          where inv.group_id = p_group_id and inv.item_id = i.id
       )
     order by random()
     limit 1;
    if not found then
      raise exception 'POOL_EXHAUSTED';
    end if;
  end if;

  -- charge the entry fee (win or lose)
  begin
    update public.groups
       set token_balance = token_balance - v_station.entry_cost
     where id = p_group_id
     returning token_balance into v_balance;
    if not found then raise exception 'GROUP_NOT_FOUND'; end if;
  exception when check_violation then
    raise exception 'INSUFFICIENT_BALANCE';
  end;

  insert into public.token_transactions (group_id, delta, reason, actor, station_id, idempotency_key)
  values (p_group_id, -v_station.entry_cost,
          'Day 2 entry: ' || v_station.name || ' (' || v_station.risk_tier || ')',
          auth.uid(), v_station.id, p_idempotency_key)
  returning id into v_tx_id;

  if p_success then
    insert into public.inventory (group_id, item_id, item_type, source, granted_by)
    values (p_group_id, v_item.id, 'puzzle', 'gm_grant', auth.uid());
  end if;

  perform public.audit('day2.challenge', 'group:' || p_group_id,
    jsonb_build_object('station', v_station.id, 'tier', v_station.risk_tier,
                       'cost', v_station.entry_cost, 'success', p_success,
                       'piece', case when p_success then v_item.name end));

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'balance', v_balance,
    'success', p_success, 'cost', v_station.entry_cost,
    'piece_name', case when p_success then v_item.name end,
    'piece_location', case when p_success then v_item.puzzle_location::text end,
    'piece_index', case when p_success then v_item.puzzle_index end
  );
end;
$$;

-- Freshie scans a committee member's blind box QR.
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

-- Live ops v2: blind boxes replace gacha stats.
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
    'blindbox_sales',        (select count(*) from public.blind_box_sales),
    'pieces_granted',        (select count(*) from public.inventory where item_type = 'puzzle'),
    'sets_redeemed',         (select count(*) from public.puzzle_redemptions),
    'projectors_activated',  (select count(*) from public.projectors where activated_at is not null)
  ) into v;
  return v;
end;
$$;

-- realtime for new tables the clients watch
alter publication supabase_realtime add table
  public.blind_box_allocations,
  public.schedule_items,
  public.faq_items;
