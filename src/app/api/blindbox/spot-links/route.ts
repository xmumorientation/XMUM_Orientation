import { NextResponse } from "next/server";

import { requireRoleDetail } from "@/lib/auth";
import { blindBoxSpotUrl } from "@/lib/blindbox";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// The Spot (hidden) boxes' codes, one per box (migration 0116). Admin only:
// fn_bb_spot_codes checks it again. The signed link is worked out here, from
// the stored random code, so it never changes between visits; nothing is
// rotated by asking for it.

export async function GET() {
  const auth = await requireRoleDetail(["admin"]);
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("fn_bb_spot_codes");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  type Row = { n: number; code: string; claimed: boolean; group_name: string | null; claimed_at: string | null };
  const codes = ((data ?? []) as Row[]).map((r) => ({
    n: r.n,
    claimed: r.claimed,
    group_name: r.group_name,
    claimed_at: r.claimed_at,
    url: blindBoxSpotUrl(r.code),
  }));
  return NextResponse.json({ codes });
}
