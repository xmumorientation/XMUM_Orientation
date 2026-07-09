import { NextRequest, NextResponse } from "next/server";

import { generateBlindBoxToken } from "@/lib/blindbox";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Create / regenerate a committee member's blind-box allocation with a
// fresh signed QR token. Regenerating invalidates any previously printed QR.

async function requireAdmin() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return profile?.role === "admin" ? user : null;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { profileId, boxType, minTokens, maxTokens, totalBoxes } =
    (await req.json()) as {
      profileId: string;
      boxType: "normal" | "special";
      minTokens: number;
      maxTokens: number;
      totalBoxes: number;
    };

  if (!profileId || !["normal", "special"].includes(boxType)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const min = Math.max(0, Number(minTokens) || 0);
  const max = Math.max(min, Number(maxTokens) || min);
  const total = Math.min(Math.max(Number(totalBoxes) || 1, 0), 50);

  const { token, tokenHash } = generateBlindBoxToken(profileId);

  const service = supabaseAdmin();
  const { error } = await service.from("blind_box_allocations").upsert(
    {
      profile_id: profileId,
      qr_hash: tokenHash,
      qr_token: token,
      box_type: boxType,
      min_tokens: min,
      max_tokens: max,
      total_boxes: total,
      active: true,
    },
    { onConflict: "profile_id" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await service.from("audit_log").insert({
    actor: admin.id,
    actor_role: "admin",
    action: "blindbox.allocate",
    target: `user:${profileId}`,
    detail: { boxType, min, max, total },
  });

  return NextResponse.json({ ok: true });
}
