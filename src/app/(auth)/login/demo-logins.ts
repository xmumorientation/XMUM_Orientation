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
];

/**
 * Demo logins show on local dev and on Vercel preview deployments, never on
 * the Vercel production deployment or a local production build.
 * VERCEL_ENV is "production", "preview" or "development" on Vercel and unset
 * elsewhere.
 */
export function demoLoginsEnabled(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) return vercelEnv !== "production";
  return process.env.NODE_ENV !== "production";
}

export function getDemoLogins(): DemoLogin[] {
  return demoLoginsEnabled() ? DEMO_LOGINS : [];
}
