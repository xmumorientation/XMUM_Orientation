import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { generateNfcToken, nfcUrl } from "@/lib/nfc";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PROJECTOR_LOCATIONS, type ProjectorLocation } from "@/lib/types";

export const dynamic = "force-dynamic";

// FR-9.1/9.2: mint signed one-time NFC tokens for physical stickers.
// The full token appears ONLY in this response — write it to the sticker
// immediately. The DB stores just the hash.

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
  const { location, count, labelPrefix } = (body ?? {}) as {
    location?: unknown;
    count?: unknown;
    labelPrefix?: unknown;
  };

  if (
    typeof location !== "string" ||
    !PROJECTOR_LOCATIONS.includes(location as ProjectorLocation)
  ) {
    return NextResponse.json({ error: "Invalid location" }, { status: 400 });
  }
  if (labelPrefix !== undefined && typeof labelPrefix !== "string") {
    return NextResponse.json({ error: "Invalid labelPrefix" }, { status: 400 });
  }
  const loc = location as ProjectorLocation;
  const n = Math.min(Math.max(Math.floor(Number(count)) || 1, 1), 20);

  const service = supabaseAdmin();
  const results: { label: string; url: string }[] = [];

  for (let i = 1; i <= n; i++) {
    const { token, tokenHash } = generateNfcToken(loc);
    const label = `${labelPrefix || loc + " sticker"} #${i}`;
    const { error } = await service.from("nfc_tokens").insert({
      token_hash: tokenHash,
      location: loc,
      label,
      created_by: admin.id,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    results.push({ label, url: nfcUrl(token) });
  }

  await service.from("audit_log").insert({
    actor: admin.id,
    actor_role: "admin",
    action: "nfc.generate",
    target: `projector:${location}`,
    detail: { count: n },
  });

  return NextResponse.json({ tokens: results });
}
