-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0116: the Spot box is one code per box (run after 0115)
--
-- Before: ONE shared QR for the whole pool, so one printed copy (or a photo
-- of it) could be scanned over and over, and each group was held to one box.
-- Now: every box in the pool has its own code, made once and stored
-- (blind_box_spot_codes). Each code can be claimed once, by anyone. Print
-- them once and hide them; a group collects as many boxes as it finds. The
-- Spot's boxes are still free and still outside the group's cap.
--
-- * "Boxes in the pool" (fn_bb_spot_save) is the number of codes. Making the
--   pool bigger adds codes; making it smaller removes unclaimed ones, highest
--   number first. Codes already made never change.
-- * Restore boxes (fn_bb_reset) deletes the claims, which frees their codes.
-- * The old shared QR stops working: the Spot is refused by the old buy and
--   preview functions (bb_refuse_spot) and claimed only with a code
--   (fn_bb_spot_claim). Spot claims already made are tied to codes 1, 2, ...
-- Safe to run again.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.blind_box_spot_codes (
  id serial primary key,
  n integer not null unique check (n >= 1),
  code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  claim_id bigint unique references public.blind_box_claims (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.blind_box_spot_codes enable row level security;
-- No policies: Admin reads through fn_bb_spot_codes, groups through the claim functions.

-- One box per code, any number per group.
drop index if exists public.blind_box_claim_group_spot_uq;

-- ── Refuse the old shared-QR path for the Spot ─────────────────────────
create or replace function public.bb_refuse_spot(p_seller_id integer)
returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  if exists (select 1 from public.blind_box_sellers where id = p_seller_id and is_spot) then
    raise exception 'BOX_UNKNOWN';
  end if;
end;
$$;
revoke all on function public.bb_refuse_spot(integer) from public;
grant execute on function public.bb_refuse_spot(integer) to anon, authenticated;

-- Adds `stmt` as the first statement of every overload of `fn`, once (as 0102
-- does), because the live functions carry later patches.
create or replace function pg_temp.bb_patch(fn text, stmt text, marker text)
returns void language plpgsql as $$
declare
  f regprocedure;
  def text;
  head integer;
  patched text;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = fn loop
    def := pg_get_functiondef(f);
    if position(marker in def) > 0 then continue; end if;
    head := position(E'\nAS ' in def);
    patched := left(def, head) || regexp_replace(substr(def, head + 1), E'\\mbegin\\M', E'begin\n  ' || stmt || E'\n', 'i');
    if patched = def then
      raise notice '0116: % has no plpgsql begin; not patched', f;
      continue;
    end if;
    execute patched;
  end loop;
  if not found then raise notice '0116: % not found; not patched', fn; end if;
end;
$$;

select pg_temp.bb_patch(f, 'perform public.bb_refuse_spot(p_seller_id);', 'bb_refuse_spot')
  from unnest(array['fn_bb_buy', 'fn_bb_buy_at', 'fn_bb_seller_preview', 'fn_bb_seller_public']) f;

-- ── Create or change the Spot; keep one code per box ───────────────────
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
  v_have integer;
  v_top integer;
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

  -- one code per box in the pool
  select count(*), coalesce(max(n), 0) into v_have, v_top from public.blind_box_spot_codes;
  if v_have < p_pool then
    insert into public.blind_box_spot_codes (n)
    select g from generate_series(v_top + 1, v_top + (p_pool - v_have)) g;
  elsif v_have > p_pool then
    delete from public.blind_box_spot_codes
     where id in (select id from public.blind_box_spot_codes
                   where claim_id is null order by n desc limit (v_have - p_pool));
  end if;

  perform public.audit('blindbox.spot_save', 'spot',
    jsonb_build_object('min', p_min, 'max', p_max, 'pool', p_pool, 'active', coalesce(p_active, true)));
  return jsonb_build_object('ok', true, 'seller_id', v_seller);
end;
$$;
revoke all on function public.fn_bb_spot_save(integer, integer, integer, boolean) from public, anon;
grant execute on function public.fn_bb_spot_save(integer, integer, integer, boolean) to authenticated;

-- Admin: every code, with who claimed it.
create or replace function public.fn_bb_spot_codes()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'n', c.n,
             'code', c.code,
             'claimed', c.claim_id is not null,
             'group_name', g.name,
             'claimed_at', cl.created_at
           ) order by c.n)
      from public.blind_box_spot_codes c
      left join public.blind_box_claims cl on cl.id = c.claim_id
      left join public.groups g on g.id = cl.group_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.fn_bb_spot_codes() from public, anon;
grant execute on function public.fn_bb_spot_codes() to authenticated;

-- ── The scan page, for a Spot code ─────────────────────────────────────
-- Logged-out visitors: only that the code is real.
create or replace function public.fn_bb_spot_public(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.blind_box_spot_codes where code = p_code) then
    raise exception 'BOX_UNKNOWN';
  end if;
  return jsonb_build_object('seller_name', 'Hidden blind box', 'spot', true);
end;
$$;

-- Read-only preview, same shape as fn_bb_seller_preview. status 'code_used':
-- someone else claimed this box; 'already_from_seller': this group did.
create or replace function public.fn_bb_spot_preview(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_group integer := public.my_group_id();
  v_c public.blind_box_spot_codes;
  v_a public.blind_box_assignments;
  v_t public.blind_box_types;
  v_balance integer;
  v_group_name text;
  v_claims integer;
  v_status text := 'ok';
  v_claim_group integer;
begin
  perform public.fn_day2_guard('blindbox');
  if public.my_role() is distinct from 'freshie' then
    raise exception 'FRESHIE_ONLY';
  end if;
  if v_group is null then
    raise exception 'NOT_IN_GROUP';
  end if;

  select * into v_c from public.blind_box_spot_codes where code = p_code;
  if not found then raise exception 'BOX_UNKNOWN'; end if;
  select a.* into v_a from public.blind_box_assignments a
    join public.blind_box_sellers s on s.id = a.seller_id and s.is_spot limit 1;
  if not found or not v_a.active then raise exception 'BOX_UNKNOWN'; end if;
  select * into v_t from public.blind_box_types where id = v_a.type_id;

  select token_balance, coalesce(nullif(display_name, ''), name)
    into v_balance, v_group_name from public.groups where id = v_group;
  select count(*) into v_claims from public.blind_box_claims where group_id = v_group and not spot;

  if v_c.claim_id is not null then
    select group_id into v_claim_group from public.blind_box_claims where id = v_c.claim_id;
    v_status := case when v_claim_group = v_group then 'already_from_seller' else 'code_used' end;
  elsif public.config_bool('blindbox_disabled', false) then
    v_status := 'disabled';
  elsif public.config_bool('tokens_frozen', false) then
    v_status := 'frozen';
  end if;

  return jsonb_build_object(
    'status', v_status,
    'spot', true,
    'seller_name', 'Hidden blind box',
    'group_name', v_group_name,
    'balance', v_balance,
    'group_claims', v_claims,
    'cap', public.bb_group_cap(),
    'options', jsonb_build_array(jsonb_build_object(
      'assignment_id', v_a.id,
      'type_name', v_t.name,
      'price', 0,
      'special', v_t.is_special,
      'left', greatest(v_a.quantity - v_a.opened, 0),
      'status', case when v_c.claim_id is not null then 'sold_out' else 'ok' end
    ))
  );
end;
$$;

-- CLAIM: free, once per code, any number per group, outside the cap.
create or replace function public.fn_bb_spot_claim(p_code text, p_idempotency_key text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_group integer := public.my_group_id();
  v_c public.blind_box_spot_codes;
  v_a public.blind_box_assignments;
  v_t public.blind_box_types;
  v_claim public.blind_box_claims;
  v_balance integer;
  v_claim_group integer;
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

  perform public.fn_day2_guard('blindbox');
  if public.config_bool('tokens_frozen', false) then
    raise exception 'TOKENS_FROZEN';
  end if;
  if public.config_bool('blindbox_disabled', false) then
    raise exception 'BLINDBOX_DISABLED';
  end if;

  select * into v_c from public.blind_box_spot_codes where code = p_code for update;
  if not found then raise exception 'BOX_UNKNOWN'; end if;
  if v_c.claim_id is not null then
    select group_id into v_claim_group from public.blind_box_claims where id = v_c.claim_id;
    if v_claim_group = v_group then raise exception 'BB_ALREADY_FROM_SELLER'; end if;
    raise exception 'BB_CODE_USED';
  end if;

  select a.* into v_a from public.blind_box_assignments a
    join public.blind_box_sellers s on s.id = a.seller_id and s.is_spot
   limit 1 for update of a;
  if not found or not v_a.active then raise exception 'BOX_UNKNOWN'; end if;
  select * into v_t from public.blind_box_types where id = v_a.type_id;
  if v_a.opened >= v_a.quantity then
    raise exception 'BOXES_SOLD_OUT';
  end if;

  insert into public.blind_box_claims (
    assignment_id, type_id, type_name, seller_name, seller_profile_id, seller_station_id,
    spot, group_id, price, tokens, special, claimed_by, idempotency_key, status
  ) values (
    v_a.id, v_t.id, v_t.name, 'Hidden blind box', null, null,
    true, v_group, 0, null, v_t.is_special, auth.uid(), p_idempotency_key, 'owned'
  ) returning * into v_claim;

  insert into public.blind_box_claim_ranges (claim_id, min_tokens, max_tokens)
  values (v_claim.id, v_t.min_tokens, v_t.max_tokens);

  update public.blind_box_assignments set opened = opened + 1 where id = v_a.id;
  update public.blind_box_spot_codes set claim_id = v_claim.id where id = v_c.id;

  perform public.audit('blindbox.spot_claim', 'group:' || v_group,
    jsonb_build_object('claim', v_claim.id, 'code_n', v_c.n));

  return jsonb_build_object('ok', true, 'duplicate', false, 'claim_id', v_claim.id,
    'price', 0, 'special', v_t.is_special,
    'seller_name', 'Hidden blind box', 'type_name', v_t.name, 'balance', v_balance);
end;
$$;

revoke all on function public.fn_bb_spot_public(text) from public;
revoke all on function public.fn_bb_spot_preview(text) from public, anon;
revoke all on function public.fn_bb_spot_claim(text, text) from public, anon;
grant execute on function public.fn_bb_spot_public(text) to anon, authenticated;
grant execute on function public.fn_bb_spot_preview(text) to authenticated;
grant execute on function public.fn_bb_spot_claim(text, text) to authenticated;

-- ── Codes for a Spot that already exists ───────────────────────────────
-- One code per box in the pool, and the claims already made take codes 1, 2, ...
do $$
declare
  v_pool integer;
  v_have integer;
  r record;
  v_n integer := 0;
begin
  select a.quantity into v_pool
    from public.blind_box_assignments a
    join public.blind_box_sellers s on s.id = a.seller_id and s.is_spot
   limit 1;
  if v_pool is null then return; end if;
  select count(*) into v_have from public.blind_box_spot_codes;
  if v_have < v_pool then
    insert into public.blind_box_spot_codes (n)
    select g from generate_series(coalesce((select max(n) from public.blind_box_spot_codes), 0) + 1,
                                  coalesce((select max(n) from public.blind_box_spot_codes), 0) + (v_pool - v_have)) g;
  end if;
  for r in select id from public.blind_box_claims cl
            where cl.spot and not exists (select 1 from public.blind_box_spot_codes c where c.claim_id = cl.id)
            order by id loop
    update public.blind_box_spot_codes set claim_id = r.id
     where id = (select id from public.blind_box_spot_codes where claim_id is null order by n limit 1);
    v_n := v_n + 1;
  end loop;
end $$;
