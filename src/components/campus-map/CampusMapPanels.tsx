"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, Crosshair, Lightbulb, MapPin, X } from "lucide-react";

import { AccuracyCheckPanel } from "@/components/AccuracyCheck";
import { BuildingStationPanel } from "@/components/BuildingStationPanel";
import {
  GroupStatusList,
  pinSummary,
  reportingSummary,
} from "@/components/GroupStatusList";
import { LightbulbList, bulbStatus, bulbTitle } from "@/components/LightbulbList";
import { StationEditDialog } from "@/components/StationEditDialog";
import { stationDotColor } from "@/components/ui";
import type { Station } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

import type { CampusMapData, MapLayer, MapView } from "./useCampusMapData";

// The campus map's controls, cards and lists. They only read and change
// CampusMapData, so any map view (2D or 3D) can sit between them.

function stationStatusText(status: Station["status"]): string {
  if (status === "available") return "Available";
  if (status === "in_progress") return "In Progress";
  return "Closed";
}

/**
 * Who is at a station. Committee tier gets the groups' names (a GM's Day 2
 * game checks its group in, so a busy station names the group playing);
 * everyone else a count, and their own group by name.
 */
function whoIsHere(data: CampusMapData, station: Station): string {
  const here = data.positions.filter((p) => p.checkin_station_id === station.id);
  if (data.staffView && here.length) return here.map((p) => p.group_name).join(", ");
  const n = data.counts[station.id] ?? 0;
  const mine = data.myGroupId != null && here.some((p) => p.group_id === data.myGroupId);
  if (mine) return n > 1 ? `Your group and ${n - 1} more` : "Your group is here";
  if (n === 0) return "No group here";
  return n === 1 ? "1 group here" : `${n} groups here`;
}

/** Stations / Lightbulbs tabs. `dark` is the full-screen look. */
export function LayerSwitch({
  data,
  dark,
}: {
  data: CampusMapData;
  dark: boolean;
}) {
  const { layer, litCount, newLit, setLayer } = data;
  const tab = (value: MapLayer, label: string, Icon: typeof MapPin) => {
    const on = layer === value;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={on}
        onClick={() => setLayer(value)}
        className={`relative inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-bold transition-colors ${
          on
            ? "bg-stone-900 text-white shadow-sm"
            : dark
              ? "text-stone-700"
              : "text-ink-soft hover:bg-paper-200"
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
        {value === "bulbs" && litCount > 0 && (
          <span
            className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
              on ? "bg-amber-400 text-stone-900" : "bg-amber-100 text-amber-800"
            } ${newLit ? "animate-pulse ring-2 ring-amber-400" : ""}`}
          >
            {litCount} lit
          </span>
        )}
      </button>
    );
  };
  return (
    <div
      role="tablist"
      aria-label="Map view"
      className={`flex w-full max-w-xs gap-1 rounded-full p-1 ${
        dark ? "bg-white shadow-lg" : "bg-paper-100 ring-1 ring-paper-200"
      }`}
    >
      {tab("stations", "Stations", MapPin)}
      {tab("bulbs", "Projectors", Lightbulb)}
    </div>
  );
}

/** Above the map: Admin's accuracy check, and the "tap where the bulb is" notice. */
export function MapToolbar({
  data,
  canManageStations,
  view,
}: {
  data: CampusMapData;
  canManageStations: boolean;
  view: MapView;
}) {
  const { checkMode, check, movingTitle } = data;
  return (
    <>
      {canManageStations && !checkMode && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={data.startCheck}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-paper-200 px-3 text-xs font-semibold hover:bg-paper-100"
          >
            <Crosshair className="h-3.5 w-3.5" />
            Accuracy check
          </button>
        </div>
      )}
      {canManageStations && checkMode && (
        <AccuracyCheckPanel
          live={check.live}
          goodFixes={check.goodFixes}
          error={data.checkError ?? check.error}
          notice={data.checkNotice}
          anchors={data.anchors}
          nowMs={data.nowMs}
          onDelete={data.deleteAnchor}
          onClose={() => data.setCheckMode(false)}
          measure={view === "3d"}
          log={data.checkLog.log}
          onClearLog={data.checkLog.clear}
        />
      )}
      {movingTitle && (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-950 ring-1 ring-amber-200">
          <span>
            Tap the map where the {bulbTitle(movingTitle, data.places)} NFC card is. Use full screen for a precise spot.
          </span>
          <button
            type="button"
            className="shrink-0 font-semibold underline"
            onClick={() => data.setMovingBulb(null)}
          >
            Cancel
          </button>
        </div>
      )}
    </>
  );
}

/** Key under the map card. */
export function MapLegend({
  layer,
  showGroupPins,
}: {
  layer: MapLayer;
  showGroupPins: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-paper-200 px-3 py-2 text-xs text-ink-faint">
      {layer === "bulbs" ? (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#fbbf24] shadow-[0_0_6px_#fbbf24]" />
            Lit
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#e7e5e4] ring-1 ring-stone-400" />
            Not lit yet
          </span>
        </>
      ) : (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#16a34a]" />
            Available
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[#dc2626] bg-white" />
            In progress
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#9ca3af]" />
            Closed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#16a34a] text-[9px] font-bold leading-none text-white">
              2
            </span>
            Open stations in a building (tap for list)
          </span>
        </>
      )}
      {showGroupPins && (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full border border-dashed border-ink-faint" />
            Group, rough location
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#0891b2]" />
            Group checked in
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-[#9ca3af] ring-2 ring-white" />
            Group not seen 10+ min
          </span>
        </>
      )}
    </div>
  );
}

/**
 * Full screen, bottom left: what is selected (check mode, moving bulb, bulb,
 * group or station), else `idle` (the view's own hint).
 */
export function MapInfoCard({
  data,
  showGroupPins,
  canManageStations,
  onStationTap,
  idle,
}: {
  data: CampusMapData;
  showGroupPins: boolean;
  canManageStations: boolean;
  onStationTap?: (station: Station) => void;
  idle: ReactNode;
}) {
  const {
    checkMode,
    check,
    checkError,
    checkNotice,
    layer,
    movingTitle,
    selectedBulb,
    bulbs,
    nowMs,
    selectedPosition,
    selectedPin,
    activeSelected,
  } = data;
  return checkMode && canManageStations && !movingTitle ? (
    <div className="pointer-events-auto rounded-2xl bg-white px-3 py-2.5 text-sm shadow-lg">
      <div className="font-semibold">Tap where you really are</div>
      <div className="text-xs text-ink-faint">
        {checkError ??
          checkNotice ??
          (check.live
            ? `GPS ±${Math.round(check.live.acc)} m · ${check.goodFixes} good fixes`
            : "Finding your location…")}
      </div>
    </div>
  ) : layer === "bulbs" && movingTitle ? (
    <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-2xl bg-amber-50 px-3 py-2.5 text-sm text-amber-950 shadow-lg">
      <span className="min-w-0">
        Tap where the {bulbTitle(movingTitle, data.places)} NFC card is.
      </span>
      <button
        type="button"
        className="shrink-0 font-semibold underline"
        onClick={() => data.setMovingBulb(null)}
      >
        Cancel
      </button>
    </div>
  ) : layer === "bulbs" && selectedBulb ? (
    (() => {
      const b = bulbs.find((item) => item.location === selectedBulb);
      if (!b) return <span />;
      return (
        <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2.5 text-sm shadow-lg">
          <div className="min-w-0">
            <div className="truncate font-semibold">{bulbTitle(b, data.places)}</div>
            <div className="truncate text-xs text-ink-faint">
              {bulbStatus(b, nowMs, data.myGroupId)}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close projector details"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            onClick={() => data.setSelectedBulb(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      );
    })()
  ) : showGroupPins && selectedPosition ? (
    <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2.5 text-sm shadow-lg">
      <div className="min-w-0">
        <div className="truncate font-semibold">
          {selectedPosition.group_name}
        </div>
        <div className="truncate text-xs text-ink-faint">
          {pinSummary(selectedPosition, selectedPin, nowMs)}
        </div>
        <div className="truncate text-xs text-ink-faint">
          {reportingSummary(selectedPosition)}
        </div>
      </div>
      <button
        type="button"
        aria-label="Close group details"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        onClick={() => data.setSelectedGroup(null)}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  ) : activeSelected && !onStationTap ? (
    <div className="pointer-events-auto rounded-2xl bg-white px-3 py-2.5 shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">
            {activeSelected.code} · {activeSelected.name}
          </div>
          <div className="truncate text-xs text-ink-faint">
            {activeSelected.area}
            {activeSelected.purpose
              ? ` · ${activeSelected.purpose}`
              : ""}
          </div>
          <div className="truncate text-xs font-semibold" style={{ color: stationDotColor(activeSelected.status) }}>
            {stationStatusText(activeSelected.status)} · {whoIsHere(data, activeSelected)}
          </div>
        </div>
        <button
          type="button"
          aria-label="Close station details"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          onClick={() => data.setSelected(null)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  ) : (
    idle
  );
}

/**
 * Under the map: station edit dialog, building panel, lightbulb list,
 * available stations, selected station and group cards, group list.
 * Under the 3D map, which has no Lightbulbs layer, the lightbulb list comes last and is always there.
 */
export function CampusMapPanels({
  data,
  showGroupPins,
  canManageStations,
  hasSelection,
  onStationTap,
  view,
}: {
  data: CampusMapData;
  showGroupPins: boolean;
  canManageStations: boolean;
  hasSelection?: boolean;
  onStationTap?: (station: Station) => void;
  view: MapView;
}) {
  const {
    layer,
    stations,
    mapStations,
    openBuilding,
    clusterArea,
    activeSelected,
    counts,
    bulbs,
    bulbError,
    nowMs,
    selectedPosition,
    selectedPin,
    positions,
    groupPins,
  } = data;
  const busyStations = mapStations.filter((station) => station.status === "in_progress");
  const openStations = mapStations.filter((station) => station.status === "available");

  // One station in a list: code, name and place, who is here, status. Tapping it selects it (and opens the
  // check-in for Admin and HOGM).
  const stationRow = (station: Station) => (
    <li key={station.id} className="flex items-center">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-paper-100"
        onClick={() => {
          data.setSelected(station);
          onStationTap?.(station);
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="w-14 shrink-0 font-bold">{station.code}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{station.name}</span>
            <span className="block truncate text-xs text-ink-faint">
              {station.area}
              {station.purpose ? ` · ${station.purpose}` : ""}
            </span>
          </span>
        </div>
        <span className="shrink-0 text-xs font-semibold text-ink-soft">
          {data.staffView || station.status === "in_progress" ? (
            // Committee tier: the groups by name; everyone else a count, or "Your group is here".
            whoIsHere(data, station)
          ) : (
            <>
              {counts[station.id] ?? 0}
              {station.max_groups != null ? ` / ${station.max_groups}` : ""} groups
            </>
          )}
        </span>
        <span
          className="chip shrink-0"
          style={{
            backgroundColor: stationDotColor(station.status) + "22",
            color: stationDotColor(station.status),
          }}
        >
          {stationStatusText(station.status)}
        </span>
      </button>
      {canManageStations && (
        <button
          type="button"
          className="mr-3 shrink-0 rounded-lg border border-paper-200 px-3 py-1 text-xs font-semibold hover:bg-paper-100"
          onClick={() => data.setEditing(station)}
        >
          Edit
        </button>
      )}
    </li>
  );
  const bulbsRef = useRef<HTMLDivElement>(null);
  const scrolledToBulbs = useRef(false);
  // /map?layer=bulbs (the Items page's "See it on the map") opens the 2D map on its Lightbulbs layer; under the
  // 3D map it scrolls to the list instead, once the bulbs have loaded.
  const hasBulbs = bulbs.length > 0;
  useEffect(() => {
    if (scrolledToBulbs.current || view !== "3d" || !hasBulbs) return;
    scrolledToBulbs.current = true;
    if (new URLSearchParams(window.location.search).get("layer") === "bulbs") {
      bulbsRef.current?.scrollIntoView({ block: "start" });
    }
  }, [view, hasBulbs]);
  const bulbList = (
    <>
      {bulbError && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          Projector not changed: {bulbError}
        </p>
      )}
      <LightbulbList
        bulbs={bulbs}
        places={data.places}
        myGroupId={data.myGroupId}
        nowMs={nowMs}
        selected={data.selectedBulb}
        onSelect={(loc) => data.setSelectedBulb((cur) => (cur === loc ? null : loc))}
        canManage={canManageStations}
        moving={data.movingBulb}
        onMove={view === "2d" ? data.setMovingBulb : undefined}
        resetting={data.resetting}
        onReset={data.resetBulb}
      />
    </>
  );
  return (
    <>
      {canManageStations && (
        <StationEditDialog
          station={data.editing}
          onClose={() => data.setEditing(null)}
          onSaved={data.loadStations}
        />
      )}

      {canManageStations && layer === "stations" && openBuilding && (
        <BuildingStationPanel
          area={openBuilding}
          stations={mapStations.filter((station) => station.area === openBuilding)}
          codes={stations.map((station) => station.code)}
          onClose={() => data.setOpenBuilding(null)}
          onChanged={data.loadStations}
        />
      )}

      {view === "2d" && layer === "bulbs" && bulbList}

      {layer === "stations" && !(hasSelection ?? !!activeSelected) && !openBuilding &&
        (clusterArea ? (
          <div className="card mt-3 overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 border-b border-paper-200 px-3 py-2">
              <h2 className="text-sm font-semibold">
                {clusterArea} stations
              </h2>
              <button
                type="button"
                onClick={() => data.setClusterArea(null)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-ink-faint hover:text-ink-base"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                All stations
              </button>
            </div>
            <ul className="divide-y divide-paper-200">
              {mapStations.filter((station) => station.area === clusterArea).map(stationRow)}
            </ul>
          </div>
        ) : (
          <>
            {/* A Day 2 game in progress, and who plays it (the GM's Start checks the group in). Short, so first. */}
            <div className="card mt-3 overflow-hidden p-0">
              <h2 className="border-b border-paper-200 px-3 py-2 text-sm font-semibold">
                In progress
              </h2>
              <ul className="divide-y divide-paper-200">
                {busyStations.map(stationRow)}
                {busyStations.length === 0 && (
                  <li className="px-3 py-4 text-sm text-ink-faint">
                    No game is running right now.
                  </li>
                )}
              </ul>
            </div>
            <div className="card mt-3 overflow-hidden p-0">
              <h2 className="border-b border-paper-200 px-3 py-2 text-sm font-semibold">
                Available stations
              </h2>
              <ul className="divide-y divide-paper-200">
                {openStations.map(stationRow)}
                {openStations.length === 0 && (
                  <li className="px-3 py-4 text-sm text-ink-faint">
                    No stations are available right now.
                  </li>
                )}
              </ul>
            </div>
          </>
        ))}

      {layer === "stations" && activeSelected && !onStationTap && (
        <div className="card mt-3 p-3">
          <div className="mb-2.5 flex items-center justify-between border-b border-paper-200 pb-2">
            <button
              type="button"
              onClick={() => data.setSelected(null)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-faint transition-colors hover:text-ink-base"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {clusterArea ? `Back to ${clusterArea} stations` : "Back to stations"}
            </button>
            <button
              type="button"
              onClick={() => data.setSelected(null)}
              aria-label="Back to stations"
              className="rounded-full p-1 text-ink-faint transition-colors hover:bg-paper-200 hover:text-ink-base"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="shrink-0 font-bold text-ink-base">
                  {activeSelected.code}
                </span>
                <p className="truncate font-semibold">{activeSelected.name}</p>
              </div>
              <p className="truncate text-xs text-ink-faint">
                {activeSelected.area}
                {activeSelected.purpose ? ` · ${activeSelected.purpose}` : ""}
              </p>
              <p className="truncate text-xs font-semibold text-ink-soft">{whoIsHere(data, activeSelected)}</p>
            </div>
            <span
              className="chip shrink-0"
              style={{
                backgroundColor: stationDotColor(activeSelected.status) + "22",
                color: stationDotColor(activeSelected.status),
              }}
            >
              {stationStatusText(activeSelected.status)}
            </span>
          </div>
        </div>
      )}

      {showGroupPins && selectedPosition && (
        <div className="card mt-3 flex items-start justify-between gap-3 p-3 text-sm">
          <div className="min-w-0">
            <div className="font-semibold">{selectedPosition.group_name}</div>
            <div className="text-xs text-ink-faint">
              {pinSummary(selectedPosition, selectedPin, nowMs)}
            </div>
            {selectedPin?.source === "gps" &&
              selectedPosition.checkin_station_code &&
              selectedPosition.checkin_at && (
                <div className="text-xs text-ink-faint">
                  Checked in at {selectedPosition.checkin_station_code} ·{" "}
                  {timeAgo(selectedPosition.checkin_at, nowMs)}
                </div>
              )}
            {selectedPin?.source === "manual" && selectedPosition.gps_at && (
              <div className="text-xs text-ink-faint">
                Last GPS{" "}
                {selectedPosition.gps_accuracy_m != null &&
                  `±${Math.round(selectedPosition.gps_accuracy_m)} m `}
                · {timeAgo(selectedPosition.gps_at, nowMs)}
              </div>
            )}
            <div className="text-xs text-ink-faint">
              {reportingSummary(selectedPosition)}
            </div>
            {selectedPin?.imprecise && selectedPin.source === "gps" && (
              <div className="mt-1 text-xs text-amber-700">
                Rough location: the dashed circle shows where the group could be.
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Close"
            className="shrink-0"
            onClick={() => data.setSelectedGroup(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {showGroupPins && (
        <GroupStatusList
          positions={positions}
          pins={groupPins}
          nowMs={nowMs}
          onSelect={(id) => data.setSelectedGroup(id)}
        />
      )}

      {view === "3d" && <div ref={bulbsRef}>{bulbList}</div>}
    </>
  );
}
