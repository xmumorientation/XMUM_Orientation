import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  console.error("Run with: node --env-file=.env.local --env-file=.env scripts/seed-test-accounts.mjs");
  process.exit(1);
}

const supabase = createClient(url, key);

const TEST_ACCOUNTS = [
  { email: "admin@test.com", role: "admin", name: "Test Admin" },
  { email: "hof@test.com", role: "hof", name: "Test HOF" },
  { email: "hogm@test.com", role: "hogm", name: "Test HOGM" },
  { email: "faci@test.com", role: "faci", name: "Test Facilitator", group_id: 1 },
  { email: "gm@test.com", role: "gm", name: "Test GameMaster", station_id: 1 },
  { email: "counter@test.com", role: "committee", name: "Test Counter" },
  { email: "freshie@test.com", role: "freshie", name: "Test Freshie", group_id: 1 },
];

async function seed() {
  console.log("Seeding test accounts...");
  const password = "pass123";

  for (const acc of TEST_ACCOUNTS) {
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
      console.log(`✅ [${acc.role.toUpperCase()}] ${acc.email} -> password: ${password}`);
    } else {
      console.error(`❌ Failed ${acc.email}`);
    }
  }
  console.log("\nDone! All test accounts ready.");
}

seed();
