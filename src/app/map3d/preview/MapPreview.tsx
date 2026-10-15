"use client";

import { useEffect, useState, type CSSProperties } from "react";

import { CampusMap2DView } from "@/components/campus-map/CampusMap2DView";
import { CampusMap3DView } from "@/components/campus-map/CampusMap3DView";
import { LayerSwitch, MapLegend } from "@/components/campus-map/CampusMapPanels";
import type { CampusMapData } from "@/components/campus-map/useCampusMapData";
import { VORTEXA_THEME, themeFromColor, type GroupTheme } from "@/components/freshie/groupTheme";
import { pinSummary } from "@/components/GroupStatusList";
import { nexusBody, vxDisplay, vxSlab } from "@/components/home/fonts";
import type { Mode } from "@/components/map3d/atmosphere";
import type { CameraView } from "@/components/map3d/CampusScene";
import "@/components/staff/game/game-control.css";
import "@/components/staff/staff-dashboard.css";
import { PageTitle } from "@/components/ui";
import { PROJECTOR_CODE_NAMES, PROJECTOR_LOCATIONS, type ProjectorLocation, type Station } from "@/lib/types";
import { cn } from "@/lib/utils";

import { FACI_GROUP, useMockMapData, type MockOptions } from "./mockData";

// DRAFT (map-3d-draft branch): the campus map on mock data, as each role's
// page shows it. Development only; nothing here talks to Supabase.
//
// ?role=freshie|faci|staff|admin  the page and props (default freshie)
// ?view=2d                         the 2D view instead of the 3D one
// ?layer=bulbs, ?select=A3-1, ?highlight=A1-1, ?group=5, ?bulb=B1, ?building=A3 (Admin), ?cluster=A3, ?names=1
// ?full=1                          open full screen
// ?color=#16a34a                   the Freshie or Faci group colour
// ?mode=day|sunset|night, ?lite=0|1, ?intro=0, ?cam=x,y,z,tx,ty,tz   the 3D scene

type Opts = MockOptions & {
  view: "3d" | "2d";
  highlight: string | null;
  full: boolean;
  color: string;
  mode?: Mode;
  lite?: boolean;
  intro: boolean;
  cam?: CameraView;
};

function readOpts(): Opts {
  const q = new URLSearchParams(window.location.search);
  const role = q.get("role");
  const bulb = q.get("bulb");
  const mode = q.get("mode");
  const lite = q.get("lite");
  const cam = q.get("cam")?.split(",").map(Number);
  return {
    role: role === "faci" || role === "staff" || role === "admin" ? role : "freshie",
    view: q.get("view") === "2d" ? "2d" : "3d",
    layer: q.get("layer") === "bulbs" ? "bulbs" : "stations",
    select: q.get("select"),
    highlight: q.get("highlight"),
    group: q.get("group") ? Number(q.get("group")) : null,
    bulb: PROJECTOR_LOCATIONS.includes(bulb as ProjectorLocation) ? (bulb as ProjectorLocation) : null,
    building: q.get("building"),
    cluster: q.get("cluster"),
    names: q.get("names") === "1",
    full: q.get("full") === "1",
    color: q.get("color") ?? (role === "faci" ? "#7c3aed" : "#fe06ab"),
    mode: mode === "day" || mode === "sunset" || mode === "night" ? mode : undefined,
    lite: lite === "1" ? true : lite === "0" ? false : undefined,
    intro: q.get("intro") !== "0" && !cam,
    cam:
      cam && cam.length === 6 && !cam.some(Number.isNaN)
        ? { position: [cam[0], cam[1], cam[2]], target: [cam[3], cam[4], cam[5]] }
        : undefined,
  };
}

/** The --fh-* variables AppShell sets for Freshie, Faci and the ops crew. */
function themeVars(theme: GroupTheme, brand: boolean): CSSProperties {
  return {
    ...(brand ? { "--brand-1": theme.accent } : {}),
    "--fh-accent": theme.accent,
    "--fh-glow": theme.glow,
    "--fh-blue": theme.accent,
    "--fh-blue-light": theme.accentLight,
    "--fh-on-blue": theme.onAccent,
  } as CSSProperties;
}

/** What the real page would show under the map (its panels are left out here: some of them read Supabase). */
function PreviewState({ data, pending, hasSelection }: { data: CampusMapData; pending: Station | null; hasSelection?: boolean }) {
  const bulb = data.bulbs.find((b) => b.location === data.selectedBulb);
  const lines = [
    `Layer: ${data.layer}${data.newLit ? " (new lit bulb: the tab pulses)" : ""}`,
    data.activeSelected && `Selected station: ${data.activeSelected.code} · ${data.activeSelected.name}`,
    pending && `Check-in sheet open for ${pending.code}`,
    data.clusterArea && `Station list under the map: ${data.clusterArea}`,
    data.openBuilding && `Admin building panel: ${data.openBuilding}`,
    data.selectedPosition && `Selected group: ${data.selectedPosition.group_name} · ${pinSummary(data.selectedPosition, data.selectedPin, data.nowMs)}`,
    bulb && `Selected lightbulb: ${PROJECTOR_CODE_NAMES[bulb.location]} · ${bulb.name}`,
    hasSelection !== undefined && `hasSelection: ${hasSelection} (the available list ${hasSelection ? "is hidden" : "shows"})`,
  ].filter(Boolean);
  return (
    <div className="card mt-3 p-3 text-xs">
      <p className="mb-1 font-semibold">Preview state (mock data)</p>
      <ul className="space-y-0.5 text-ink-faint">
        {lines.map((line) => (
          <li key={String(line)}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function Preview({ opts }: { opts: Opts }) {
  const data = useMockMapData(opts);
  const [fullscreen, setFullscreen] = useState(opts.full);
  const [pending, setPending] = useState<Station | null>(null);
  const { role } = opts;
  const showGroupPins = role !== "freshie";
  const canManageStations = role === "admin";
  const hasSelection = role === "faci" ? pending !== null : role === "staff" ? true : undefined;
  const viewProps = {
    data,
    showGroupPins,
    canManageStations,
    highlightStationId: data.stations.find((s) => s.code === opts.highlight)?.id ?? null,
    onStationTap: role === "faci" ? setPending : undefined,
    fullscreen,
    onFullscreenChange: setFullscreen,
    legend: <MapLegend layer={data.layer} showGroupPins={showGroupPins} />,
  };

  const map = (
    <div>
      <div className="mb-2 flex justify-center" aria-hidden={fullscreen}>
        <LayerSwitch data={data} dark={false} />
      </div>
      {opts.view === "2d" ? (
        <CampusMap2DView {...viewProps} />
      ) : (
        <CampusMap3DView {...viewProps} mode={opts.mode} lite={opts.lite} intro={opts.intro} camera={opts.cam} />
      )}
      <PreviewState data={data} pending={pending} hasSelection={hasSelection} />
    </div>
  );
  const main = "mx-auto w-full px-3 pb-8 pt-3 sm:px-5 sm:pt-5 lg:px-8 lg:py-6";

  if (role === "staff") {
    // HOF, HOGM, Committee on /map: the dark staff shell in the Welcome page colours, and the Ops map design.
    return (
      <div
        className={cn("staff-dashboard-shell staff-vx min-h-dvh", nexusBody.variable, vxDisplay.variable)}
        style={themeVars(VORTEXA_THEME, false)}
      >
        <main className={cn(main, "max-w-6xl")}>
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
            {map}
          </div>
        </main>
      </div>
    );
  }

  if (role === "faci") {
    // Faci's map is /checkin: the dark staff shell in the group's colour; tapping a station offers a check-in.
    return (
      <div
        className={cn("staff-dashboard-shell min-h-dvh", nexusBody.variable, vxDisplay.variable)}
        style={themeVars(themeFromColor(opts.color), true)}
      >
        <main className={cn(main, "max-w-6xl")}>
          <h1 className="mb-1 text-2xl font-bold">Check in</h1>
          <p className="mb-4 text-sm opacity-75">Group {FACI_GROUP}. Tap a station on the map to check your group in.</p>
          {map}
          {pending && (
            <div className="fixed inset-x-0 bottom-20 z-[90] px-4">
              <div className="card mx-auto flex max-w-lg items-center justify-between gap-3 p-4 shadow-glow">
                <div>
                  <p className="font-semibold">Check in at {pending.name}?</p>
                  <p className="text-xs text-ink-faint">{pending.area}</p>
                </div>
                <button type="button" className="btn-secondary shrink-0" onClick={() => setPending(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div
      className="min-h-dvh bg-paper-50"
      style={role === "freshie" ? themeVars(themeFromColor(opts.color), true) : undefined}
    >
      <main className={cn(main, role === "admin" ? "max-w-[96rem]" : "max-w-6xl")}>
        <PageTitle
          title="Campus map"
          subtitle={
            role === "admin"
              ? "Day 2 stations. Tap the map for a full-screen view. Click a building to add a station or change its game and status."
              : "Day 2 stations. Tap the map for a full-screen view. Tap a station or a building's badge for details."
          }
        />
        {map}
      </main>
    </div>
  );
}

export default function MapPreview() {
  const [opts, setOpts] = useState<Opts | null>(null);
  useEffect(() => setOpts(readOpts()), []);
  return opts ? <Preview opts={opts} /> : null;
}
