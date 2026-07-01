import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { ProfileProvider } from "@/components/ProfileProvider";
import { supabaseServer } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  return (
    <ProfileProvider profile={profile as Profile}>
      <AppShell>{children}</AppShell>
    </ProfileProvider>
  );
}
