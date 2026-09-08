import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { PhaseTimerProvider } from "@/components/PhaseTimerProvider";
import { ProfileProvider } from "@/components/ProfileProvider";
import { resolveCurrentUserContext } from "@/lib/context";
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

  const context = await resolveCurrentUserContext();
  if (!context || context.userId !== userId) redirect("/login");

  const [{ data: profileRow }, { data: group }] = await Promise.all([
    supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single(),
    context.groupId
      ? supabase.from("groups").select("*").eq("id", context.groupId).single()
      : Promise.resolve({ data: null }),
  ]);
  if (!profileRow) redirect("/login");
  const profile = { ...(profileRow as Profile), role: context.role,
    group_id: context.groupId, station_id: context.stationId,
    admin_team: context.adminTeam } satisfies Profile;

  return (
    <ProfileProvider profile={profile} context={context} initialGroup={(group as Group | null) ?? null}>
      <PhaseTimerProvider>
        <AppShell>{children}</AppShell>
      </PhaseTimerProvider>
    </ProfileProvider>
  );
}
