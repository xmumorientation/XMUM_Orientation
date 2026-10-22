"use client";

import { useState } from "react";

import { CampusMap } from "@/components/CampusMap";
import { FreshieMap } from "@/components/freshie/FreshieMap";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { useProfile } from "@/components/ProfileProvider";
import "@/components/staff/game/game-control.css";
import { GmStationCheckinModal } from "@/components/staff/game/GmStationCheckinModal";
import { PageTitle } from "@/components/ui";
import { COMMITTEE_TIER, VORTEXA_ROLES, type Station } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function MapPage() {
  const profile = useProfile();

  const [checkinStation, setCheckinStation] = useState<Station | null>(null);

  // Only Admin and HOGM check groups in; a GM can look at the map but not check groups in.
  const canCheckin = profile.role === "admin" || profile.role === "hogm";

  // Every role sees every group's pin (0101; Ben: the group locations are
  // open to everyone in the app). The flag just requests pins.
  const showPins =
    COMMITTEE_TIER.includes(profile.role) ||
    ["gm", "guardian_gm", "faci", "freshie"].includes(profile.role);

  // HOF, HOGM, Committee and GM: the same night, eyebrow and title as their
  // other tabs (Ops or Station, Scores). No station list under the map: Ops
  // already has one. HOGM checks in groups by tapping a station.
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
          <p className="gc-muted">
            {profile.role === "hogm"
              ? "Tap a station to check in arriving groups, or tap the map for a full-screen view."
              : "Tap the map for a full-screen view. Tap a station for details."}
          </p>
        </header>
        <CampusMap
          showGroupPins={showPins}
          hasSelection={checkinStation !== null}
          onStationTap={canCheckin ? setCheckinStation : undefined}
        />
        {canCheckin && (
          <GmStationCheckinModal
            station={checkinStation}
            onClose={() => setCheckinStation(null)}
          />
        )}
      </div>
    );
  }

  // Freshie and Faci: the night look and group colour of Freshie Home.
  // Faci can view the map and group pins, but cannot check in.
  if (profile.role === "freshie" || profile.role === "faci") {
    return <FreshieMap showGroupPins={showPins} />;
  }

  // GM (fallback if not in VORTEXA_ROLES) and Admin view
  return (
    <div className="space-y-4">
      <PageTitle
        title="Campus map"
        subtitle={
          profile.role === "admin"
            ? "Day 2 stations. Tap a station to check in arriving groups. Click a building to add or edit stations."
            : "Day 2 stations. Tap the map for a full-screen view. Tap a station for details."
        }
      />

      <CampusMap
        showGroupPins={showPins}
        canManageStations={profile.role === "admin"}
        hasSelection={checkinStation !== null}
        onStationTap={canCheckin ? setCheckinStation : undefined}
      />

      {canCheckin && (
        <GmStationCheckinModal
          station={checkinStation}
          onClose={() => setCheckinStation(null)}
        />
      )}
    </div>
  );
}
