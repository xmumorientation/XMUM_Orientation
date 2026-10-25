import { NextRequest, NextResponse } from "next/server";

import { requireRoleDetail } from "@/lib/auth";
import { blindBoxUrlFor } from "@/lib/blindbox";
import { supabaseServer } from "@/lib/supabase/server";
import { BLINDBOX_HOLDER_ROLES } from "@/lib/types";

export const dynamic = "force-dynamic";

// Blind-box links are HMACs of (seller id, qr_version), so they are
// recomputed here on demand and never stored. A seller with one live box type
// has ONE link (every assignment returns the same URL); a seller with two or
// more live types has one link per assignment (lib/blindbox.ts, "bb4"), so a
// Freshie scans the code of the box they want. Reading is a plain RLS select
// with the caller's own session: an Admin gets any assignment, everyone else
// only their own account's. Nothing is rotated or
// changed by asking for a link.
//
// Body: { ids?: number[] }. Omit ids for every assignment the caller can see.

export async function POST(req: NextRequest) {
  const auth = await requireRoleDetail(BLINDBOX_HOLDER_ROLES);
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: unknown = await req.json().catch(() => ({}));
  const { ids } = (body ?? {}) as { ids?: unknown };
  if (
    ids !== undefined &&
    (!Array.isArray(ids) ||
      ids.length > 500 ||
      !ids.every((n) => Number.isInteger(n)))
  ) {
    return NextResponse.json({ error: "Invalid ids" }, { status: 400 });
  }

  const supabase = await supabaseServer();
  // All the caller's assignments, not only `ids`: whether a seller has two or
  // more live types decides if each assignment gets its own link.
  const { data, error } = await supabase
    .from("blind_box_assignments")
    .select("id, active, seller:blind_box_sellers(id, qr_version), type:blind_box_types(archived)");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Seller = { id: number; qr_version: number };
  type Row = {
    id: number;
    active: boolean;
    seller: Seller | Seller[] | null;
    type: { archived: boolean } | { archived: boolean }[] | null;
  };
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const rows = ((data ?? []) as unknown as Row[]).flatMap((a) => {
    const seller = one(a.seller);
    return seller ? [{ id: a.id, active: a.active, live: a.active && !one(a.type)?.archived, seller }] : [];
  });
  const liveBySeller = new Map<number, number>();
  for (const r of rows) if (r.live) liveBySeller.set(r.seller.id, (liveBySeller.get(r.seller.id) ?? 0) + 1);

  const links = rows
    .filter((r) => !ids || (ids as number[]).includes(r.id))
    .map((r) => {
      const typed = (liveBySeller.get(r.seller.id) ?? 0) > 1;
      return { id: r.id, active: r.active, url: blindBoxUrlFor(r.seller.id, r.seller.qr_version, typed ? r.id : undefined) };
    });
  return NextResponse.json({ links });
}
