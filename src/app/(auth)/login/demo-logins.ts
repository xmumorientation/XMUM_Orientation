// Server-only: the one-tap demo logins for the test accounts.
// This module is imported only by the server page, so these passwords never
// ship in the client bundle. The page passes them to the form only when
// demoLoginsEnabled() is true.

export type DemoLogin = { label: string; email: string; pass: string };

const DEMO_LOGINS: DemoLogin[] = [
  { label: "Admin", email: "admin.test@xmu.edu.my", pass: "TestPass123!" },
  { label: "Faci", email: "faci.test@xmu.edu.my", pass: "TestPass123!" },
  { label: "GM", email: "gm.test@xmu.edu.my", pass: "TestPass123!" },
  { label: "HOF", email: "hof.test@xmu.edu.my", pass: "TestPass123!" },
  { label: "HOGM", email: "hogm.test@xmu.edu.my", pass: "TestPass123!" },
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
  return demoLoginsEnabled() ? DEMO_LOGINS : [];
}
