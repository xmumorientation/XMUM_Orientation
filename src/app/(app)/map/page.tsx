"use client";

import { useEffect, useMemo, useState } from "react";

import { CampusMap } from "@/components/CampusMap";
import { FreshieMap } from "@/components/freshie/FreshieMap";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { useProfile } from "@/components/ProfileProvider";
import "@/components/staff/game/game-control.css";
import { GmStationCheckinModal } from "@/components/staff/game/GmStationCheckinModal";
import { Card, PageTitle, StationStatusChip } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { COMMITTEE_TIER, VORTEXA_ROLES, type Station } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function MapPage() {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [checkinStation, setCheckinStation] = useState<Station | null>(null);
  const [myStation, setMyStation] = useState<Station | null>(null);

  const isGm = profile.role === "gm" || profile.role === "guardian_gm";
  const isLead = profile.role === "admin" || profile.role === "hogm";
  const canCheckin = isGm || isLead;

  // Committee tier sees every group's pin; Faci and Freshies see only their
  // own group's (0094; the RPC enforces this server-side - the flag just
  // requests pins).
  const showPins =
    COMMITTEE_TIER.includes(profile.role) || profile.role === "faci" || profile.role === "freshie";

  // Fetch assigned station for Game Master
  useEffect(() => {
    if (!profile.station_id) return;
    let active = true;

    supabase
      .from("stations")
      .select("*")
      .eq("id", profile.station_id)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) {
          setMyStation(data as Station);
        }
      });

    return () => {
      active = false;
    };
  }, [supabase, profile.station_id]);

  // HOF, HOGM, Committee and GM: the same night, eyebrow and title as their
  // other tabs (Ops or Station, Scores). No station list under the map: Ops
  // already has one. GMs and HOGM check in groups by tapping a station.
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
            {profile.role === "gm"
              ? "Tap your assigned station to check in arriving groups, or tap the map for a full-screen view."
              : profile.role === "hogm"
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
            : isGm
              ? "Day 2 stations. Tap your assigned station to check in arriving groups."
              : "Day 2 stations. Tap the map for a full-screen view. Tap a station for details."
        }
      />

      {/* Quick Access Card for GM's Assigned Station */}
      {isGm && myStation && (
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                Your Assigned Station
              </span>
              <StationStatusChip status={myStation.status} />
            </div>
            <p className="truncate text-base font-bold text-ink-base">
              {myStation.code} · {myStation.name}
            </p>
            <p className="text-xs text-ink-soft">
              {myStation.area}
              {myStation.purpose ? ` · ${myStation.purpose}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCheckinStation(myStation)}
            className="btn-primary shrink-0 self-start text-xs sm:self-auto"
          >
            Station Check-in
          </button>
        </Card>
      )}

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
