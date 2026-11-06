import { createClient } from "@supabase/supabase-js";

// Creates the test accounts, or resets their passwords, in the database that
// .env.local points at. The password is TEST_ACCOUNT_PASSWORD in .env.local
// (gitignored); it is never written in the repo.
//
// Run with: node --experimental-websocket --env-file=.env.local scripts/seed-test-accounts.mjs

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.TEST_ACCOUNT_PASSWORD;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  console.error("Run with: node --experimental-websocket --env-file=.env.local scripts/seed-test-accounts.mjs");
  process.exit(1);
}
if (!password || password.length < 16) {
  console.error("Set TEST_ACCOUNT_PASSWORD in .env.local (16 characters or more).");
  console.error("For example: openssl rand -base64 24");
  process.exit(1);
}

// supabase-js needs a global WebSocket, which Node 20 has only behind a flag.
if (typeof globalThis.WebSocket === "undefined") {
  console.error("This Node has no WebSocket. Use Node 22+, or add --experimental-websocket:");
  console.error("node --experimental-websocket --env-file=.env.local scripts/seed-test-accounts.mjs");
  process.exit(1);
}

const supabase = createClient(url, key);

const TEST_ACCOUNTS = [
  { email: "admin.test@xmu.edu.my", role: "admin", name: "Test Admin" },
  { email: "freshie.test@xmu.edu.my", role: "freshie", name: "Test Freshie", group_id: 1 },
  { email: "hof.test@xmu.edu.my", role: "hof", name: "Test HOF" },
  { email: "oc.test@xmu.edu.my", role: "oc", name: "Test OC" },
  { email: "hogm.test@xmu.edu.my", role: "hogm", name: "Test HOGM" },
  { email: "faci.test@xmu.edu.my", role: "faci", name: "Test Facilitator", group_id: 1 },
  { email: "gm.test@xmu.edu.my", role: "gm", name: "Test GameMaster" },
  { email: "cmt.test@xmu.edu.my", role: "committee", name: "Test Committee" },
  { email: "admin@test.com", role: "admin", name: "Test Admin" },
  { email: "freshie@test.com", role: "freshie", name: "Test Freshie", group_id: 1 },
  { email: "hof@test.com", role: "hof", name: "Test HOF" },
  { email: "hogm@test.com", role: "hogm", name: "Test HOGM" },
  { email: "faci@test.com", role: "faci", name: "Test Facilitator", group_id: 1 },
  { email: "gm@test.com", role: "gm", name: "Test GameMaster" },
  { email: "counter@test.com", role: "committee", name: "Test Counter" },
];

// listUsers() returns one page at a time, so walk every page.
async function findUserIdsByEmail(emails) {
  const wanted = new Set(emails.map((e) => e.toLowerCase()));
  const found = new Map();
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) {
      const email = (u.email ?? "").toLowerCase();
      if (wanted.has(email)) found.set(email, u.id);
    }
    if (data.users.length < 1000) break;
  }
  return found;
}

async function seed() {
  console.log(`Seeding test accounts in ${new URL(url).hostname} ...`);
  const existing = await findUserIdsByEmail(TEST_ACCOUNTS.map((a) => a.email));
  let failed = 0;

  // A new GM goes to the first station that exists (station ids change when
  // stations are deleted and re-added).
  const { data: firstStation } = await supabase
    .from("stations").select("id").order("id").limit(1).maybeSingle();

  for (const acc of TEST_ACCOUNTS) {
    const userId = existing.get(acc.email.toLowerCase());

    // An existing account only gets the new password. Its profile (role,
    // group, station) is left as testers set it.
    if (userId) {
      const { error } = await supabase.auth.admin.updateUserById(userId, { password });
      if (error) {
        console.error(`❌ ${acc.email}: ${error.message}`);
        failed++;
      } else {
        console.log(`✅ [${acc.role.toUpperCase()}] ${acc.email} (password reset)`);
      }
      continue;
    }

    {
      const { data, error } = await supabase.auth.admin.createUser({
        email: acc.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: acc.name },
        app_metadata: { role: acc.role },
      });
      if (error || !data?.user) {
        console.error(`❌ ${acc.email}: ${error?.message ?? "not created"}`);
        failed++;
        continue;
      }
      const { error: profileErr } = await supabase.from("profiles").upsert({
        id: data.user.id,
        role: acc.role,
        full_name: acc.name,
        group_id: acc.group_id ?? null,
        station_id: acc.role === "gm" ? firstStation?.id ?? null : null,
      });
      if (profileErr) {
        console.error(`❌ ${acc.email}: created, but profile ${profileErr.message}`);
        failed++;
        continue;
      }
      console.log(`✅ [${acc.role.toUpperCase()}] ${acc.email} (created)`);
    }
  }

  console.log(failed ? `\n${failed} account(s) failed.` : "\nDone. Password: TEST_ACCOUNT_PASSWORD in .env.local.");
  if (failed) process.exit(1);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
