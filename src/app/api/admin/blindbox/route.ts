import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { generateBlindBoxToken } from "@/lib/blindbox";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Create / regenerate a committee member's blind-box allocation with a
// fresh signed QR token. Regenerating invalidates any previously printed QR.

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { profileId, boxType, minTokens, maxTokens, totalBoxes } = (body ??
    {}) as {
    profileId?: unknown;
    boxType?: unknown;
    minTokens?: unknown;
    maxTokens?: unknown;
    totalBoxes?: unknown;
  };

  if (
    typeof profileId !== "string" ||
    !profileId ||
    (boxType !== "normal" && boxType !== "special")
  ) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const min = Math.max(0, Math.floor(Number(minTokens)) || 0);
  const max = Math.max(min, Math.floor(Number(maxTokens)) || min);
  const total = Math.min(Math.max(Math.floor(Number(totalBoxes)) || 1, 0), 50);

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
