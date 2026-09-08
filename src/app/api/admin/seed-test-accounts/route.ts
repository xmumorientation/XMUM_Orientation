import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const TEST_ACCOUNTS: {
  email: string;
  role: UserRole;
  name: string;
  group_id?: number;
  station_id?: number;
  password?: string;
}[] = [
  // Official Demo Accounts (xmu.edu.my)
  { email: "admin.test@xmu.edu.my", role: "admin", name: "Test Admin", password: "TestPass123!" },
  { email: "faci.test@xmu.edu.my", role: "faci", name: "Test Facilitator", group_id: 1, password: "TestPass123!" },
  { email: "gm.test@xmu.edu.my", role: "gm", name: "Test GameMaster", station_id: 1, password: "TestPass123!" },

  // Quick Short Accounts (test.com)
  { email: "admin@test.com", role: "admin", name: "Test Admin", password: "pass123" },
  { email: "faci@test.com", role: "faci", name: "Test Facilitator", group_id: 1, password: "pass123" },
  { email: "gm@test.com", role: "gm", name: "Test GameMaster", station_id: 1, password: "pass123" },
];

export async function POST() {
  const admin = await requirePermission("accounts.manage");
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const service = supabaseAdmin();
  const results: { email: string; role: string; status: string }[] = [];

  for (const acc of TEST_ACCOUNTS) {
    const password = acc.password || "pass123";
    const { data: newUser, error: createErr } = await service.auth.admin.createUser({
      email: acc.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: acc.name },
      app_metadata: { role: acc.role },
    });

    let userId = newUser?.user?.id;

    if (createErr && createErr.message.includes("already")) {
      const { data: list } = await service.auth.admin.listUsers();
      const existing = list?.users?.find((u) => u.email === acc.email);
      if (existing) {
        userId = existing.id;
        await service.auth.admin.updateUserById(userId, { password });
      }
    }

    if (userId) {
      await service.from("profiles").upsert({
        id: userId,
        role: acc.role,
        full_name: acc.name,
        group_id: acc.group_id ?? null,
        station_id: acc.station_id ?? null,
      });
      if (acc.group_id !== undefined) {
        await service.from("user_group_assignments").upsert(
          {
            user_id: userId,
            group_id: acc.group_id,
            source: "test_seed",
            created_by: admin.user.id,
            updated_by: admin.user.id,
          },
          { onConflict: "user_id" }
        );
      }
      if (acc.station_id !== undefined && acc.role === "gm") {
        await service.from("gm_station_assignments").upsert(
          ([1, 2] as const).map((day) => ({
            user_id: userId,
            day,
            station_id: acc.station_id!,
            created_by: admin.user.id,
            updated_by: admin.user.id,
          })),
          { onConflict: "user_id,day" }
        );
      }
      results.push({ email: acc.email, role: acc.role, status: "ready" });
    } else {
      results.push({ email: acc.email, role: acc.role, status: "error" });
    }
  }

  return NextResponse.json({
    message: "Test accounts created / updated successfully",
    accounts: results,
  });
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
