import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const TEST_ACCOUNTS: {
  email: string;
  role: UserRole;
  name: string;
  group_id?: number;
  station_id?: number;
}[] = [
  { email: "admin@test.com", role: "admin", name: "Test Admin" },
  { email: "hof@test.com", role: "hof", name: "Test HOF" },
  { email: "hogm@test.com", role: "hogm", name: "Test HOGM" },
  { email: "faci@test.com", role: "faci", name: "Test Facilitator", group_id: 1 },
  { email: "gm@test.com", role: "gm", name: "Test GameMaster", station_id: 1 },
  { email: "counter@test.com", role: "committee", name: "Test Counter" },
  { email: "freshie@test.com", role: "freshie", name: "Test Freshie", group_id: 1 },
];

export async function POST() {
  const service = supabaseAdmin();
  const password = "pass123";
  const results: { email: string; role: string; status: string }[] = [];

  for (const acc of TEST_ACCOUNTS) {
    // 1. Try to create user
    const { data: newUser, error: createErr } = await service.auth.admin.createUser({
      email: acc.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: acc.name },
      app_metadata: { role: acc.role },
    });

    let userId = newUser?.user?.id;

    if (createErr && createErr.message.includes("already")) {
      // User exists — fetch existing user ID and update password
      const { data: list } = await service.auth.admin.listUsers();
      const existing = list.users.find((u) => u.email === acc.email);
      if (existing) {
        userId = existing.id;
        await service.auth.admin.updateUserById(userId, { password });
      }
    }

    if (userId) {
      // Update profile
      await service.from("profiles").upsert({
        id: userId,
        role: acc.role,
        full_name: acc.name,
        group_id: acc.group_id ?? null,
        station_id: acc.station_id ?? null,
      });
      results.push({ email: acc.email, role: acc.role, status: "ready" });
    } else {
      results.push({ email: acc.email, role: acc.role, status: "error" });
    }
  }

  return NextResponse.json({
    message: "Test accounts created / updated successfully",
    password,
    accounts: results,
  });
}

export async function GET() {
  return POST();
}
