import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  console.error("Run with: node --env-file=.env.local scripts/seed-test-accounts.mjs");
  process.exit(1);
}

const supabase = createClient(url, key);

const TEST_ACCOUNTS = [
  // Official Demo Accounts (xmu.edu.my)
  { email: "admin.test@xmu.edu.my", role: "admin", name: "Test Admin", password: "TestPass123!" },
  { email: "faci.test@xmu.edu.my", role: "faci", name: "Test Facilitator", group_id: 1, password: "TestPass123!" },
  { email: "gm.test@xmu.edu.my", role: "gm", name: "Test GameMaster", station_id: 1, password: "TestPass123!" },

  // Quick Short Accounts (test.com)
  { email: "admin@test.com", role: "admin", name: "Test Admin", password: "pass123" },
  { email: "faci@test.com", role: "faci", name: "Test Facilitator", group_id: 1, password: "pass123" },
  { email: "gm@test.com", role: "gm", name: "Test GameMaster", station_id: 1, password: "pass123" },
];

async function seed() {
  console.log("Seeding official demo & test accounts...");

  for (const acc of TEST_ACCOUNTS) {
    const password = acc.password;
    const { data, error } = await supabase.auth.admin.createUser({
      email: acc.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: acc.name },
      app_metadata: { role: acc.role },
    });

    let userId = data?.user?.id;
    if (error && error.message.includes("already")) {
      const { data: list } = await supabase.auth.admin.listUsers();
      const existing = list?.users?.find((u) => u.email === acc.email);
      if (existing) {
        userId = existing.id;
        await supabase.auth.admin.updateUserById(userId, { password });
      }
    }

    if (userId) {
      await supabase.from("profiles").upsert({
        id: userId,
        role: acc.role,
        full_name: acc.name,
        group_id: acc.group_id ?? null,
        station_id: acc.station_id ?? null,
      });
      if (acc.group_id !== undefined) {
        await supabase.from("user_group_assignments").upsert(
          {
            user_id: userId,
            group_id: acc.group_id,
            source: "test_seed",
          },
          { onConflict: "user_id" }
        );
      }
      if (acc.station_id !== undefined && acc.role === "gm") {
        await supabase.from("gm_station_assignments").upsert(
          [1, 2].map((day) => ({
            user_id: userId,
            day,
            station_id: acc.station_id,
          })),
          { onConflict: "user_id,day" }
        );
      }
      console.log(`✅ [${acc.role.toUpperCase()}] ${acc.email} -> password: ${password}`);
    } else {
      console.error(`❌ Failed ${acc.email}`);
    }
  }
  console.log("\nDone! All test accounts ready.");
}

seed();
