"use client";

import { CampusMap } from "@/components/CampusMap";
import { useCurrentUserContext } from "@/components/ProfileProvider";
import { PageTitle } from "@/components/ui";
import { hasPermission } from "@/lib/permissions";

export default function MapPage() {
  const context = useCurrentUserContext();
  // Management sees all group pins; Faci/Freshie see only their own group.
  // The RPC enforces the scope server-side; this flag only requests pins.
  const showPins =
    hasPermission(context.permissions, "group.locations.view_all") ||
    hasPermission(context.permissions, "group.locations.view_own") ||
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
