import { redirect } from "next/navigation";

import { PhaseTimerProvider } from "@/components/PhaseTimerProvider";
import { supabaseServer } from "@/lib/supabase/server";

// Projector big screen lives outside (app): no sidebar/mobile chrome, just a
// full-bleed dark canvas. Committee tier only — it shows every group's
// balance, which freshies must not see (SRS §2).
export default async function ScreenLayout({
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
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["hof", "hogm", "committee", "admin"].includes(profile.role)) {
    redirect("/dashboard");
  }

  return <PhaseTimerProvider>{children}</PhaseTimerProvider>;
}
