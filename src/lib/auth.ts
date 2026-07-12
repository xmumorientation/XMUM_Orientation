import { supabaseServer } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

// Shared role gate for privileged API routes. UI hiding and RLS are the real
// boundaries; this stops a request early with a clear 403 before touching the
// service-role client. Previously copy-pasted into every admin route.
export async function requireRole(
  roles: UserRole[]
): Promise<User | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return profile && roles.includes(profile.role as UserRole) ? user : null;
}

export function requireAdmin(): Promise<User | null> {
  return requireRole(["admin"]);
}
