"use client";

import { PersistentCampusMap } from "@/components/campus-map/PersistentCampusMap";
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

  // Every role sees every group's pin (0108; Ben: the group locations are
  // open to everyone in the app). The flag just requests pins.
  const showPins =
    COMMITTEE_TIER.includes(profile.role) ||
    ["gm", "guardian_gm", "faci", "freshie"].includes(profile.role);

  // Admin shares the staff map frame; only its station controls differ.
  if (VORTEXA_ROLES.includes(profile.role) || profile.role === "admin") {
    return (
      <div className={cn("gc gc-map", vxDisplay.variable, vxSlab.variable)}>
        <div className="gc-bg" aria-hidden>
          <i className="gc-orb gc-orb-navy" />
          <i className="gc-orb gc-orb-pink" />
        </div>
        <header className="gc-top">
          <p className="gc-eyebrow">Campus</p>
          <h1 className="gc-title">Map</h1>
          <p className="gc-muted">
            Tap the map for a full-screen view. Tap a station for details.
            {profile.role === "admin" && " Select a building on the map to add or edit its stations."}
          </p>
        </header>
        <PersistentCampusMap showGroupPins={showPins} canManageStations={profile.role === "admin"} />
      </div>
    );
  }

  // Freshie and Faci: the night look and group colour of Freshie Home.
  if (profile.role === "freshie" || profile.role === "faci") {
    return <FreshieMap showGroupPins={showPins} />;
  }

  // Guardian GM keeps the older staff map.
  return (
    <div className="space-y-4">
      <PageTitle
        title="Campus Map"
        subtitle="Live game stations. Tap the map for a full-screen view. Tap a station or a building's badge for details."
      />

      <PersistentCampusMap showGroupPins={showPins} />
    </div>
  );
}
