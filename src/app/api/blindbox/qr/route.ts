import { NextRequest, NextResponse } from "next/server";

import { requirePermission } from "@/lib/auth";
import { blindBoxUrl, generateBlindBoxToken } from "@/lib/blindbox";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Rotate-on-demand blind-box QR (see migration 0007). Tokens carry a
// random nonce and are never stored — only qr_hash is. This route mints a
// fresh token for the caller's allocation (or, admin-only, any member's),
// overwrites qr_hash, and returns the URL exactly once for rendering.
// Every call invalidates that member's previously displayed/printed QR;
// existing claims are unaffected (fn_scan_blind_box matches the current
// hash, claims are keyed by allocation_id).

export async function POST(req: NextRequest) {
  const auth = await requirePermission("configuration.manage");
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Body is optional ({} → rotate own QR); tolerate an empty body.
  const body: unknown = await req.json().catch(() => ({}));
  const { profileId } = (body ?? {}) as { profileId?: unknown };
  if (profileId !== undefined && typeof profileId !== "string") {
    return NextResponse.json({ error: "Invalid profileId" }, { status: 400 });
  }

  let target = auth.user.id;
  if (profileId && profileId !== auth.user.id) target = profileId;

  const service = supabaseAdmin();
  const { data: alloc } = await service
    .from("blind_box_allocations")
    .select("id")
    .eq("profile_id", target)
    .maybeSingle();
  if (!alloc) {
    return NextResponse.json(
      { error: "No blind-box allocation for this member" },
      { status: 404 }
    );
  }

  const { token, tokenHash } = generateBlindBoxToken(target);
  const { error } = await service
    .from("blind_box_allocations")
    .update({ qr_hash: tokenHash })
    .eq("id", alloc.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await service.from("audit_log").insert({
    actor: auth.user.id,
    actor_role: auth.context.role,
    action: "blindbox.qr_rotate",
    target: `user:${target}`,
    detail: { self: target === auth.user.id },
  });

  return NextResponse.json({ url: blindBoxUrl(token) });
}
