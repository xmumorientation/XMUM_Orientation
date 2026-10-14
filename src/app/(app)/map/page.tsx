"use client";

import { CampusMap } from "@/components/CampusMap";
import { FaciTrackingPanel } from "@/components/FaciTrackingPanel";
import { useProfile } from "@/components/ProfileProvider";
import { PageTitle } from "@/components/ui";
import { COMMITTEE_TIER } from "@/lib/types";

export default function MapPage() {
  const profile = useProfile();
  // D-1: committee sees all group pins; Faci sees own group only (the RPC
  // enforces this server-side - the flag just requests pins).
  const showPins =
    COMMITTEE_TIER.includes(profile.role) || profile.role === "faci";

  return (
    <div>
      <PageTitle
        title="Campus map"
        subtitle={
          profile.role === "admin"
            ? "Day 2 stations. Tap the map for a full-screen view. Click a building to add a station or change its game and status."
            : "Day 2 stations. Tap the map for a full-screen view. Tap a station or a building's badge for details."
        }
      />
      <FaciTrackingPanel />
      <CampusMap
        showGroupPins={showPins}
        canManageStations={profile.role === "admin"}
      />
    </div>
  );
}
