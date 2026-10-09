import { NextRequest, NextResponse } from "next/server";

import { requireRoleDetail } from "@/lib/auth";
import { blindBoxUrlFor } from "@/lib/blindbox";
import { supabaseServer } from "@/lib/supabase/server";
import { BLINDBOX_HOLDER_ROLES } from "@/lib/types";

export const dynamic = "force-dynamic";

// Blind-box links are HMACs of (assignment id, qr_version), so they are
// recomputed here on demand and never stored. Reading is a plain RLS select
// with the caller's own session: an Admin gets any assignment, everyone else
// only their own account's and their own station's. Nothing is rotated or
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
  let query = supabase
    .from("blind_box_assignments")
    .select("id, qr_version, active");
  if (ids) query = query.in("id", ids as number[]);
  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    links: (data ?? []).map((a) => ({
      id: a.id as number,
      active: a.active as boolean,
      url: blindBoxUrlFor(a.id as number, a.qr_version as number),
    })),
  });
}
