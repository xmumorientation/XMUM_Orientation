"use client";

import { CampusMap } from "@/components/CampusMap";
import { FreshieMap } from "@/components/freshie/FreshieMap";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { useProfile } from "@/components/ProfileProvider";
import "@/components/staff/game/game-control.css";
import { PageTitle } from "@/components/ui";
import { COMMITTEE_TIER, VORTEXA_ROLES } from "@/lib/types";
import { cn } from "@/lib/utils";

// Nobody checks groups in from the map: a GM's Day 2 Start does it, and HOGM
// or Admin clear a group left behind on Ops → Stations or Admin → Stations.
// Tapping a station shows its status and who is there, for every role.
export default function MapPage() {
  const profile = useProfile();

  // Every role sees every group's pin (0101; Ben: the group locations are
  // open to everyone in the app). The flag just requests pins.
  const showPins =
    COMMITTEE_TIER.includes(profile.role) ||
    ["gm", "guardian_gm", "faci", "freshie"].includes(profile.role);

  // HOF, HOGM, Committee and GM: the same night, eyebrow and title as their
  // other tabs (Ops or Station, Scores).
  if (VORTEXA_ROLES.includes(profile.role)) {
    return (
      <div className={cn("gc gc-map", vxDisplay.variable, vxSlab.variable)}>
        <div className="gc-bg" aria-hidden>
          <i className="gc-orb gc-orb-navy" />
          <i className="gc-orb gc-orb-pink" />
        </div>
        <header className="gc-top">
          <p className="gc-eyebrow">Campus</p>
          <h1 className="gc-title">Map</h1>
          <p className="gc-muted">Tap the map for a full-screen view. Tap a station for details.</p>
        </header>
        <CampusMap showGroupPins={showPins} />
      </div>
    );
  }

  // Freshie and Faci: the night look and group colour of Freshie Home.
  if (profile.role === "freshie" || profile.role === "faci") {
    return <FreshieMap showGroupPins={showPins} />;
  }

  // Admin (and Guardian GM, who is not in VORTEXA_ROLES).
  return (
    <div className="space-y-4">
      <PageTitle
        title="Campus map"
        subtitle={
          profile.role === "admin"
            ? "Live game stations. Tap the map for a full-screen view. Click a building to add a station or change its game and status."
            : "Live game stations. Tap the map for a full-screen view. Tap a station or a building's badge for details."
        }
      />

      <CampusMap showGroupPins={showPins} canManageStations={profile.role === "admin"} />
    </div>
  );
}
