import { NextRequest, NextResponse } from "next/server";

import { generateNfcToken, nfcUrl } from "@/lib/nfc";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import type { ProjectorLocation } from "@/lib/types";

export const dynamic = "force-dynamic";

// FR-9.1/9.2: mint signed one-time NFC tokens for physical stickers.
// The full token appears ONLY in this response — write it to the sticker
// immediately. The DB stores just the hash.

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

  const { location, count, labelPrefix } = (await req.json()) as {
    location: ProjectorLocation;
    count: number;
    labelPrefix?: string;
  };

  if (!["B1", "A3", "TF"].includes(location)) {
    return NextResponse.json({ error: "Invalid location" }, { status: 400 });
  }
  const n = Math.min(Math.max(Number(count) || 1, 1), 20);

  const service = supabaseAdmin();
  const results: { label: string; url: string }[] = [];

  for (let i = 1; i <= n; i++) {
    const { token, tokenHash } = generateNfcToken(location);
    const label = `${labelPrefix || location + " sticker"} #${i}`;
    const { error } = await service.from("nfc_tokens").insert({
      token_hash: tokenHash,
      location,
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
