"use client";

import { CampusMap } from "@/components/CampusMap";
import { FaciTrackingPanel } from "@/components/FaciTrackingPanel";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { useProfile } from "@/components/ProfileProvider";
import "@/components/staff/game/game-control.css";
import { StationBoard } from "@/components/staff/StationBoard";
import { PageTitle } from "@/components/ui";
import { COMMITTEE_TIER, OPS_ROLES } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function MapPage() {
  const profile = useProfile();
  // D-1: committee sees all group pins; Faci sees own group only (the RPC
  // enforces this server-side - the flag just requests pins).
  const showPins =
    COMMITTEE_TIER.includes(profile.role) || profile.role === "faci";
  const map = (
    <CampusMap
      showGroupPins={showPins}
      canManageStations={profile.role === "admin"}
    />
  );

  // HOF, HOGM, Committee: the same night, eyebrow and title as their other
  // tabs (Ops, Scores). Under the map, every station read only (StationBoard)
  // in place of the map's own "Available stations" list.
  if (OPS_ROLES.includes(profile.role)) {
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
        <CampusMap showGroupPins={showPins} hasSelection />
        <StationBoard />
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        title="Campus map"
        subtitle={
          profile.role === "admin"
            ? "Live game stations. Tap the map for a full-screen view. Click a building to add a station or change its game and status."
            : "Live game stations. Tap the map for a full-screen view. Tap a station or a building's badge for details."
        }
      />
      <FaciTrackingPanel />
      {map}
    </div>
  );
}
