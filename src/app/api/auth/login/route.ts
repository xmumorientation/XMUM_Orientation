import { NextRequest, NextResponse } from "next/server";

import { recordAuthAudit } from "@/lib/auth-audit";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const INVALID_LOGIN = "Invalid username or password.";

export async function POST(req: NextRequest) {
  const body: unknown = await req.json().catch(() => null);
  const { identifier, password } = (body ?? {}) as {
    identifier?: unknown;
    password?: unknown;
  };
  if (
    typeof identifier !== "string" ||
    typeof password !== "string" ||
    !identifier.trim() ||
    !password
  ) {
    return NextResponse.json({ error: INVALID_LOGIN }, { status: 400 });
  }

  const normalized = identifier.trim().toLowerCase();
  let email = normalized;
  if (!normalized.includes("@")) {
    const { data } = await supabaseAdmin()
      .from("profiles")
      .select("email")
      .ilike("username", normalized)
      .maybeSingle();
    if (!data?.email) {
      await recordAuthAudit({
        action: "auth.login_failed",
        identifier: normalized,
        reason: "invalid_credentials",
      });
      return NextResponse.json({ error: INVALID_LOGIN }, { status: 401 });
    }
    email = data.email;
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    await recordAuthAudit({
      action: "auth.login_failed",
      identifier: normalized,
      reason: "invalid_credentials",
    });
    return NextResponse.json({ error: INVALID_LOGIN }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  if (!profile) {
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: "Your account registry entry is missing. Contact Admin." },
      { status: 403 }
    );
  }

  const role = profile.role as UserRole;
  await recordAuthAudit({
    action: "auth.login",
    actor: data.user.id,
    actorRole: role,
  });
  return NextResponse.json({ ok: true, role });
}
