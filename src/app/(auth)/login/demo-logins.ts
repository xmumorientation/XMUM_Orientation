// Server-only: the one-tap demo logins for the test accounts.
// This module is imported only by the server page, so the password never
// ships in the client bundle. The page passes the logins to the form only
// when demoLoginsEnabled() is true. The password is TEST_ACCOUNT_PASSWORD in
// .env.local (gitignored), set by scripts/seed-test-accounts.mjs.

export type DemoLogin = { label: string; email: string; pass: string };

const DEMO_ACCOUNTS: Omit<DemoLogin, "pass">[] = [
  { label: "Admin", email: "admin.test@xmu.edu.my" },
  { label: "Faci", email: "faci.test@xmu.edu.my" },
  { label: "GM", email: "gm.test@xmu.edu.my" },
  { label: "HOF", email: "hof.test@xmu.edu.my" },
  { label: "OC", email: "oc.test@xmu.edu.my" },
  { label: "HOGM", email: "hogm.test@xmu.edu.my" },
];

/**
 * Demo logins show only on local dev (`npm run dev`): never on any Vercel
 * deployment (production or preview, where VERCEL_ENV is set) and never in a
 * production build.
 */
export function demoLoginsEnabled(): boolean {
  if (process.env.VERCEL_ENV) return false;
  return process.env.NODE_ENV === "development";
}

export function getDemoLogins(): DemoLogin[] {
  const pass = process.env.TEST_ACCOUNT_PASSWORD;
  if (!demoLoginsEnabled() || !pass) return [];
  return DEMO_ACCOUNTS.map((a) => ({ ...a, pass }));
}
