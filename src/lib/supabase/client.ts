"use client";

import { createBrowserClient } from "@supabase/ssr";

// Singleton browser client — safe because createBrowserClient dedupes.
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
