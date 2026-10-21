import { NextResponse } from "next/server";

import { requireRoleDetail } from "@/lib/auth";
import { groupLoginEmail, groupLoginPassword } from "@/lib/group-login";
import { signPayloadStable, verifyToken } from "@/lib/signed-token";
import { siteUrl } from "@/lib/site-url";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Group QR: /join?g=<token>, where the token is an HMAC of the group number
// only. It never changes, so printed QRs survive a new password (Admin →
// Freshies) and even a group reset. The password never leaves the server:
// POST looks up the group's current code and signs the phone in here.

const joinToken = (groupId: number) => signPayloadStable({ k: "grp", g: groupId });

// GET: the QR links. Admin gets every group, a Faci only their own.
export async function GET() {
  const me = await requireRoleDetail(["admin", "faci"]);
  if (!me) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const service = supabaseAdmin();
  let ids: number[];
  if (me.role === "admin") {
    const { data } = await service.from("groups").select("id");
    ids = (data ?? []).map((g) => g.id as number);
  } else {
    const { data } = await service.from("profiles").select("group_id").eq("id", me.user.id).single();
    ids = data?.group_id ? [data.group_id as number] : [];
  }
  const urls = Object.fromEntries(
    ids.map((id) => [id, `${siteUrl()}/join?g=${encodeURIComponent(joinToken(id))}`])
  );
  return NextResponse.json({ urls });
}

// POST { t }: sign this phone in as the token's group.
export async function POST(request: Request) {
  const { t } = (await request.json().catch(() => ({}))) as { t?: unknown };
  const res = typeof t === "string" ? verifyToken(t) : { valid: false as const };
  const groupId = res.valid ? (res.payload as { k?: string; g?: unknown }).g : null;
  if (!res.valid || (res.payload as { k?: string }).k !== "grp" || !Number.isInteger(groupId)) {
    return NextResponse.json({ error: "Not a group QR" }, { status: 400 });
  }

  const { data: row } = await supabaseAdmin()
    .from("group_login_codes")
    .select("code")
    .eq("group_id", groupId as number)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "This group has no login yet" }, { status: 404 });

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email: groupLoginEmail(groupId as number),
    password: groupLoginPassword(row.code as string),
  });
  if (error) return NextResponse.json({ error: "Could not sign the group in" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
