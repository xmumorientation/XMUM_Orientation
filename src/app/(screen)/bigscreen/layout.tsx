import { redirect } from "next/navigation";

import { PhaseTimerProvider } from "@/components/PhaseTimerProvider";
import { resolveCurrentUserContext } from "@/lib/context";
import { hasPermission } from "@/lib/permissions";

// Projector big screen lives outside (app): no sidebar/mobile chrome, just a
// full-bleed dark canvas. Admin only — it shows every group's
// balance, which freshies must not see (SRS §2).
export default async function ScreenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await resolveCurrentUserContext();
  if (!context) redirect("/login");
  if (!hasPermission(context.permissions, "admin.access")) {
    redirect("/dashboard");
  }

  return <PhaseTimerProvider>{children}</PhaseTimerProvider>;
}
