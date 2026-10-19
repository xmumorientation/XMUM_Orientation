import { NextRequest, NextResponse } from "next/server";

import { requireRoleDetail } from "@/lib/auth";
import { generateNfcToken, nfcUrl } from "@/lib/nfc";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PROJECTOR_LOCATIONS, type ProjectorLocation } from "@/lib/types";

export const dynamic = "force-dynamic";

// FR-9.1/9.2: mint signed one-time NFC tokens for physical stickers.
// The full token appears ONLY in this response — write it to the sticker
// immediately. The DB stores just the hash.

// Admin, and HOGM from Ops → Game control (migration 0071 lets both read the list).
export async function POST(req: NextRequest) {
  const caller = await requireRoleDetail(["admin", "hogm"]);
  if (!caller) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const admin = caller.user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { location, count, labelPrefix, testRunId } = (body ?? {}) as {
    location?: unknown;
    count?: unknown;
    labelPrefix?: unknown;
    testRunId?: unknown;
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
  if (testRunId !== undefined) {
    if (caller.role !== "admin" || typeof testRunId !== "string") {
      return NextResponse.json({ error: "Test stickers are Admin only" }, { status: 403 });
    }
    const { data: run } = await service
      .from("nfc_test_runs")
      .select("id, location, closed_at")
      .eq("id", testRunId)
      .is("closed_at", null)
      .single();
    if (!run || run.location !== loc) {
      return NextResponse.json({ error: "Active test run not found for this location" }, { status: 400 });
    }
  }
  const results: { id: number; label: string; url: string }[] = [];

  for (let i = 1; i <= n; i++) {
    const { token, tokenHash } = generateNfcToken(loc);
    const label = `${labelPrefix || loc + " sticker"} #${i}`;
    const { data, error } = await service.from("nfc_tokens").insert({
      token_hash: tokenHash,
      location: loc,
      label,
      created_by: admin.id,
      ...(typeof testRunId === "string" ? { test_run_id: testRunId } : {}),
    }).select("id").single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    results.push({ id: data.id, label, url: nfcUrl(token) });
  }

  await service.from("audit_log").insert({
    actor: admin.id,
    actor_role: caller.role,
    action: "nfc.generate",
    target: `projector:${location}`,
    detail: { count: n, ...(typeof testRunId === "string" ? { test_run_id: testRunId } : {}) },
  });

  return NextResponse.json({ tokens: results });
}
