"use client";

import { useEffect, useMemo, useState } from "react";

import { readingText, useCheckLog } from "@/components/AccuracyCheck";
import {
  buildClusters,
  buildGroupPins,
  buildStationSpots,
  spreadPins,
  type CampusMapData,
  type MapLayer,
} from "@/components/campus-map/useCampusMapData";
import { funfairFromBulbs } from "@/lib/funfair";
import { MAP_BUILDINGS } from "@/lib/mapBuildings";
import { GPS_POINTS, LANDMARKS } from "@/lib/mapGeo";
import type { GroupPosition, MapLightbulb, ProjectorLocation, Station, StationStatus } from "@/lib/types";

// DRAFT (map-3d-draft branch): mock map data for /map3d/preview. Builds the
// same CampusMapData as useCampusMapData from fixed rows, in memory only (no
// Supabase), with the hook's derived data from its exported helpers.

/** The group a preview Faci belongs to (fn_group_positions returns only their own group). */
export const FACI_GROUP = 5;

/** A GPS point `e` metres east and `n` metres north of `p`. */
function near(p: { lat: number; lng: number }, e: number, n: number) {
  return { lat: p.lat + n / 110574, lng: p.lng + e / (111320 * Math.cos((p.lat * Math.PI) / 180)) };
}

const TF = GPS_POINTS["Track & Field"];

function spot(area: string) {
  const b = MAP_BUILDINGS.find((item) => item.area === area);
  return { map_x: b?.x ?? 50, map_y: b?.y ?? 50 };
}

const ROWS: [code: string, name: string, area: string, status: StationStatus, day: 1 | 2][] = [
  ["A1-1", "Treasure Hunt", "A1", "available", 2],
  ["A3-1", "Escape Room", "A3", "available", 2],
  ["A3-2", "Riddle Wall", "A3", "in_progress", 2],
  ["A3-3", "Quiz Bowl", "A3", "closed", 2],
  ["A4-1", "Paint Splash", "A4", "closed", 2],
  ["A5-1", "Tug of War", "A5", "in_progress", 2],
  ["A5-2", "Relay Race", "A5", "available", 2],
  ["B1-1", "Lab Rush", "B1", "available", 2],
  ["B1-2", "Code Break", "B1", "available", 2],
  ["TF-1", "Sprint", "Track & Field", "in_progress", 2],
  ["TC-1", "Tennis Toss", "Tennis Court", "available", 2],
  ["VC-1", "Volley Pass", "Volleyball Court", "closed", 2],
  ["VC-2", "Spike It", "Volleyball Court", "available", 2],
  ["TBD-1", "New game", "TBD", "available", 2],
  ["A2-1", "Day 1 icebreaker", "A2", "available", 1],
];

function mockStations(): Station[] {
  return ROWS.map(([code, name, area, status, day], i) => ({
    id: i + 1,
    code,
    name,
    area,
    purpose: name,
    status,
    ...spot(area),
    risk_tier: "low",
    entry_cost: 0,
    day,
    max_groups: 4,
    lat: null,
    lng: null,
    radius_m: null,
    status_override: false,
  }));
}

function mockPositions(now: number, stations: Station[]): GroupPosition[] {
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  const station = (code: string) => stations.find((s) => s.code === code)!;
  const row = (
    id: number,
    gps: { lat: number; lng: number; acc: number; min: number } | null,
    checkin: { code: string; min: number } | null,
  ): GroupPosition => ({
    group_id: id,
    group_name: `Group ${id}`,
    gps_lat: gps?.lat ?? null,
    gps_lng: gps?.lng ?? null,
    gps_accuracy_m: gps?.acc ?? null,
    gps_at: gps ? ago(gps.min) : null,
    facis_reporting: gps && gps.min < 2 ? 2 : 0,
    facis_total: 2,
    checkin_station_id: checkin ? station(checkin.code).id : null,
    checkin_station_code: checkin ? checkin.code : null,
    checkin_station_name: checkin ? station(checkin.code).name : null,
    checkin_at: checkin ? ago(checkin.min) : null,
  });
  const lake = LANDMARKS.find((l) => l.name === "Lake causeway")!;
  return [
    // Fresh, precise, in front of A3.
    row(1, { ...near(GPS_POINTS.A3, 45, -45), acc: 12, min: 0.5 }, null),
    // Faded (5 min), by the lake.
    row(2, { ...near(lake, -20, -25), acc: 35, min: 5 }, null),
    // Two groups checked in at one B1 station: side by side.
    row(3, { ...near(GPS_POINTS.B1, 0, 0), acc: 20, min: 20 }, { code: "B1-2", min: 2 }),
    row(4, null, { code: "B1-2", min: 1 }),
    // Rough fix (dashed, with its accuracy circle), by the courts.
    row(5, { ...near(GPS_POINTS["Volleyball Court"], 20, 10), acc: 240, min: 1 }, null),
    // Not seen for 25 min, at the LY4 dorm.
    row(6, { ...near(TF, -303, 395), acc: 25, min: 25 }, null),
    // Fresh, at the D2 dorm.
    row(7, { ...near(TF, 16, 377), acc: 18, min: 0.3 }, null),
    // No fix at all: listed as not seen, no pin.
    row(8, null, null),
    // Checked in at an A3 station (in A3's badge) and at A1's only station.
    row(9, null, { code: "A3-1", min: 3 }),
    row(10, null, { code: "A1-1", min: 4 }),
  ];
}

function mockBulbs(now: number): MapLightbulb[] {
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  const bulb = (location: ProjectorLocation, name: string, area: string, group: number | null, min: number) => {
    const { map_x, map_y } = spot(area);
    return {
      location,
      name,
      map_x,
      map_y,
      activated_by_group: group,
      group_name: group != null ? `Group ${group}` : null,
      activated_at: group != null ? ago(min) : null,
      activated_manually: false,
    };
  };
  return [bulb("B1", "B1 Basement", "B1", 3, 12), bulb("A3", "A3 Building", "A3", null, 0), bulb("TF", "Track & Field", "Track & Field", 7, 3)];
}

export type MockOptions = {
  role: "freshie" | "faci" | "staff" | "admin";
  layer: MapLayer;
  select: string | null;
  group: number | null;
  bulb: ProjectorLocation | null;
  building: string | null;
  cluster: string | null;
  names: boolean;
  /** Admin's accuracy check on, with a GPS fix near A3 (`?check=1`). */
  check: boolean;
  /** The Lightbulbs layer exists (2D only), as in useCampusMapData. */
  bulbLayer: boolean;
};

/** CampusMapData from the rows above. Actions change only this page's memory. */
export function useMockMapData(opts: MockOptions): CampusMapData {
  const [nowMs] = useState(() => Date.now());
  const [stations] = useState(mockStations);
  const [positions] = useState(() => {
    const all = mockPositions(nowMs, stations);
    if (opts.role === "freshie") return [];
    return opts.role === "faci" ? all.filter((g) => g.group_id === FACI_GROUP) : all;
  });
  const [bulbs, setBulbs] = useState(() => mockBulbs(nowMs));
  const [layerState, setLayerState] = useState<MapLayer>(opts.layer);
  const layer: MapLayer = opts.bulbLayer ? layerState : "stations";
  const [selected, setSelected] = useState<Station | null>(() => stations.find((s) => s.code === opts.select) ?? null);
  const [openBuilding, setOpenBuilding] = useState<string | null>(opts.building);
  const [clusterArea, setClusterArea] = useState<string | null>(opts.cluster);
  const [selectedBulb, setSelectedBulb] = useState<ProjectorLocation | null>(opts.bulb);
  const [movingBulb, setMovingBulb] = useState<ProjectorLocation | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<number | null>(opts.group);
  const [showNames, setShowNames] = useState(opts.names);
  const [editing, setEditing] = useState<Station | null>(null);
  const [checkMode, setCheckMode] = useState(opts.check);
  const [checkNotice, setCheckNotice] = useState<string | null>(null);
  // A steady fix on the open lawn 30 m south of the statue, ±6 m.
  const [fix] = useState(() => {
    const statue = LANDMARKS.find((l) => l.name === "Tan Kah Kee statue")!;
    return { ...near(statue, 0, -30), acc: 6, t: nowMs };
  });
  const checkLog = useCheckLog();
  // One bulb seen before: the second lit one makes the Lightbulbs tab pulse, as on the real map.
  const [seenLit, setSeenLit] = useState(1);

  const mapStations = useMemo(() => stations.filter((s) => s.day === 2), [stations]);
  const clusters = useMemo(() => buildClusters(mapStations), [mapStations]);
  const clusteredIds = useMemo(() => new Set(clusters.flatMap((c) => c.stations.map((s) => s.id))), [clusters]);
  const stationSpots = useMemo(() => buildStationSpots(mapStations), [mapStations]);
  const groupPins = useMemo(
    () => buildGroupPins(positions, stations, stationSpots, nowMs),
    [positions, stations, stationSpots, nowMs],
  );
  const drawnPins = useMemo(() => spreadPins(positions, groupPins), [positions, groupPins]);
  const counts = useMemo(() => Object.fromEntries(mapStations.map((s) => [s.id, s.id % 3])), [mapStations]);

  const litCount = bulbs.filter((b) => b.activated_at).length;
  // The funfair with its default keys (the preview never asks Supabase).
  const funfair = useMemo(() => funfairFromBulbs(bulbs), [bulbs]);
  useEffect(() => {
    if (layer === "bulbs" && litCount !== seenLit) setSeenLit(litCount);
  }, [layer, litCount, seenLit]);
  const newLit = layer === "stations" && litCount > seenLit;

  function setLayer(next: MapLayer) {
    setLayerState(next);
    setSelected(null);
    setSelectedBulb(null);
    setMovingBulb(null);
    setOpenBuilding(null);
    setClusterArea(null);
  }

  const selectedPosition = positions.find((g) => g.group_id === selectedGroup) ?? null;

  return {
    myId: "preview",
    nowMs,
    stations,
    mapStations,
    clusters,
    clusteredIds,
    stationSpots,
    counts,
    activeSelected: selected,
    setSelected,
    openBuilding,
    setOpenBuilding,
    clusterArea,
    setClusterArea,
    editing,
    setEditing,
    showNames,
    setShowNames,
    loadStations: async () => {},
    layer,
    setLayer,
    bulbs,
    litCount,
    funfair,
    newLit,
    selectedBulb,
    setSelectedBulb,
    movingBulb,
    setMovingBulb,
    movingTitle: movingBulb ? bulbs.find((b) => b.location === movingBulb) : undefined,
    bulbError: null,
    resetting: null,
    resetBulb: async (loc: ProjectorLocation) => {
      setBulbs((list) => list.map((b) => (b.location === loc ? { ...b, activated_at: null, activated_by_group: null, group_name: null } : b)));
    },
    placeBulb: async (x: number, y: number) => {
      const loc = movingBulb;
      setMovingBulb(null);
      if (loc) setBulbs((list) => list.map((b) => (b.location === loc ? { ...b, map_x: x, map_y: y } : b)));
    },
    positions,
    groupPins,
    drawnPins,
    selectedGroup,
    setSelectedGroup,
    selectedPosition,
    selectedPin: selectedGroup != null ? (groupPins.get(selectedGroup) ?? null) : null,
    check: {
      live: checkMode ? fix : null,
      error: null,
      others: [],
      averaged: () => ({ lat: fix.lat, lng: fix.lng, accuracy: fix.acc, fixes: 3 }),
      goodFixes: checkMode ? 3 : 0,
    },
    checkMode,
    setCheckMode,
    startCheck: () => setCheckMode(true),
    checkNotice,
    checkError: null,
    anchors: [],
    placeAnchor: async () => {},
    measureCheck: (offsetTo: (lat: number, lng: number) => { east: number; north: number }) => {
      const offset = offsetTo(fix.lat, fix.lng);
      checkLog.add({ t: Date.now(), ...offset, acc: fix.acc, fixes: 3 });
      setCheckNotice(`Your GPS reads ${readingText(offset)} of where you tapped (±${fix.acc} m, 3 fixes).`);
    },
    checkLog,
    deleteAnchor: async () => {},
  };
}
