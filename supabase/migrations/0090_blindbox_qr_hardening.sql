-- ═══════════════════════════════════════════════════════════════════════
-- Migration 0090: blind box QR hardening (run after 0070)
-- (Written as 0079 and already run on the live project under that name;
-- renumbered after main's own 0079-0089. Safe to run again.)
--
-- 1. QR versions are random, not 1, 2, 3. fn_bb_buy / fn_bb_seller_preview /
--    fn_bb_seller_public take (seller id, qr_version) straight from the
--    signed QR; the signature itself is only checked by the Next page. With
--    sequential versions a Freshie could call fn_bb_buy from the browser with
--    seller 1..N and version 1 and buy from every seller without scanning.
--    A random 31-bit version is not guessable, and Regenerate picks a new
--    random one.
--    ⚠ Every existing blind-box QR stops working when this runs. Sellers'
--      cards and Admin show the new one on their next load.
-- 2. blind_box_sellers joins the realtime publication, so a seller's card and
--    Admin's page pick up Regenerate at once (it only changes this table).
-- 3. An assignment with sold boxes can no longer be deleted. Deleting a
--    station or a seller account cascaded to its assignments; the sold boxes
--    then counted as unassigned stock again and could be handed out twice.
--    fn_bb_set_quantity (only when nothing was sold) and fn_bb_reset (which
--    zeroes `opened` first) still delete as before.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Random QR versions ──────────────────────────────────────────────

-- 31 random bits from gen_random_uuid() (a v4 UUID's first 8 hex digits are
-- random), never 0.
create or replace function public.bb_new_qr_version()
returns integer
language sql volatile set search_path = public
as $$
  select greatest(
    ('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::integer & 2147483647,
    1);
$$;

alter table public.blind_box_sellers
  alter column qr_version set default public.bb_new_qr_version();

-- "where true": some Supabase setups refuse an UPDATE with no WHERE.
update public.blind_box_sellers set qr_version = public.bb_new_qr_version() where true;

create or replace function public.fn_bb_regenerate(p_id integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_seller integer;
  v_old integer;
  v_version integer;
begin
  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  select a.seller_id, s.qr_version into v_seller, v_old
    from public.blind_box_assignments a
    join public.blind_box_sellers s on s.id = a.seller_id
   where a.id = p_id;
  if not found then
    raise exception 'BOX_UNKNOWN';
  end if;
  loop
    v_version := public.bb_new_qr_version();
    exit when v_version <> v_old;
  end loop;
  update public.blind_box_sellers set qr_version = v_version where id = v_seller;
  perform public.audit('blindbox.regenerate', 'seller:' || v_seller,
    jsonb_build_object('via_assignment', p_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- ── 2. Realtime for Regenerate ─────────────────────────────────────────
-- RLS still applies: only Admin and the seller themselves read the row.

do $$ begin
  alter publication supabase_realtime add table public.blind_box_sellers;
exception when others then null;
end $$;

-- ── 3. Sold boxes keep their assignment ────────────────────────────────

create or replace function public.trg_bb_assignment_keep_sold()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if old.opened > 0 then
    raise exception 'BB_HAS_SALES';
  end if;
  return old;
end;
$$;

drop trigger if exists bb_assignment_keep_sold on public.blind_box_assignments;
create trigger bb_assignment_keep_sold
  before delete on public.blind_box_assignments
  for each row execute function public.trg_bb_assignment_keep_sold();
