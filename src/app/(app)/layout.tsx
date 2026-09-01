import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { PhaseTimerProvider } from "@/components/PhaseTimerProvider";
import { ProfileProvider } from "@/components/ProfileProvider";
import { supabaseServer } from "@/lib/supabase/server";
import type { Group, Profile } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await supabaseServer();

  // Middleware already validated the session with getUser() on this request;
  // getClaims() verifies the JWT locally instead of a second Auth round trip.
  // The RLS-scoped profile query below is the authoritative check — a forged
  // token returns no profile and redirects.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) redirect("/login");

  // One round trip for profile + group (the dashboard needs both).
  const { data: row } = await supabase
    .from("profiles")
    .select("*, group:groups!profiles_group_id_fkey(*)")
    .eq("id", userId)
    .single();

  if (!row) redirect("/login");

  const { group, ...profile } = row as Profile & { group: Group | null };

  return (
    <ProfileProvider profile={profile as Profile} initialGroup={group}>
      <PhaseTimerProvider>
        <AppShell>{children}</AppShell>
      </PhaseTimerProvider>
    </ProfileProvider>
  );
}
