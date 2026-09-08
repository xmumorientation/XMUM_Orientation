"use client";

import { CampusMap } from "@/components/CampusMap";
import { useCurrentUserContext } from "@/components/ProfileProvider";
import { PageTitle } from "@/components/ui";
import { hasPermission } from "@/lib/permissions";

export default function MapPage() {
  const context = useCurrentUserContext();
  // Admin sees all group pins; Faci sees their own group only (the RPC
  // enforces this server-side - the flag just requests pins).
  const showPins =
    hasPermission(context.permissions, "operations.manage") ||
    hasPermission(context.permissions, "map.update");

  return (
    <div>
      <PageTitle
        title="Campus map"
        subtitle="Available, in progress, and closed stations. Tap a station for details."
      />
      <CampusMap showGroupPins={showPins} />
    </div>
  );
}
