import { NextResponse } from "next/server";

import { recordAuthAudit } from "@/lib/auth-audit";
import { resolveCurrentUserContext } from "@/lib/context";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const context = await resolveCurrentUserContext();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await recordAuthAudit({
    action: "auth.logout",
    actor: context.userId,
    actorRole: context.role,
  });
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
