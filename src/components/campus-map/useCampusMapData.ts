"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAccuracyCheck } from "@/components/AccuracyCheck";
import { bulbTitle } from "@/components/LightbulbList";
import { useProfile } from "@/components/ProfileProvider";
import { supabaseBrowser } from "@/lib/supabase/client";
import type {
  GroupPosition,
  MapAnchor,
  MapLightbulb,
  ProjectorLocation,
  Station,
} from "@/lib/types";
import { MAP_BUILDINGS, stationPosition } from "@/lib/mapBuildings";
import { resolveGroupPin, type GroupPin } from "@/lib/groupPosition";
import { friendlyError } from "@/lib/utils";
import { gpsToMapPercent, setExtraAnchors } from "@/lib/mapGeo";

// Data and state shared by every campus map view (2D and 3D).
// Positions are percentages of the 2D Figma art (see mapBuildings.ts).

/** Stations mode shows game stations; Lightbulbs mode shows the lit (and, once unlocked, unlit) lightbulbs. */
export type MapLayer = "stations" | "bulbs";
/** Which map draws the data: the 3D campus, or the 2D art (the fallback). */
export type MapView = "3d" | "2d";
const LAYER_KEY = "campus-map-layer";
const SEEN_LIT_KEY = "campus-map-seen-lit";

export type MapSpot = { x: number; y: number };
/** A building with two or more stations: drawn as one badge. */
export type StationCluster = { area: string; x: number; y: number; stations: Station[] };
/** A group pin to draw, with a sideways offset (2D art units) when pins share a spot. */
export type DrawnPin = { g: GroupPosition; pin: GroupPin; dx: number };

/** Colour for a building badge: green if any station is open, else red if any is busy, else grey. */
export function clusterStatus(list: Station[]): Station["status"] {
  if (list.some((s) => s.status === "available")) return "available";
  if (list.some((s) => s.status === "in_progress")) return "in_progress";
  return "closed";
}

function readStored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the choice just isn't remembered.
  }
}

// Buildings with two or more stations show one badge instead of a dot each.
export function buildClusters(mapStations: Station[]): StationCluster[] {
  const list: StationCluster[] = [];
  for (const b of MAP_BUILDINGS) {
    const here = mapStations.filter((s) => s.area === b.area);
    if (here.length >= 2) list.push({ area: b.area, x: b.x, y: b.y, stations: here });
  }
  return list;
}

export function buildStationSpots(mapStations: Station[]): Map<number, MapSpot> {
  const byArea = new Map<string, Station[]>();
  for (const station of mapStations) {
    const list = byArea.get(station.area) ?? [];
    list.push(station);
    byArea.set(station.area, list);
  }
  const spots = new Map<number, MapSpot>();
  for (const [area, list] of byArea) {
    const building = MAP_BUILDINGS.find((b) => b.area === area);
    list.forEach((station, index) => {
      // One station sits on the building's centre; several (shown only
      // when zoomed in) spread round it.
      if (building && list.length === 1) {
        spots.set(station.id, { x: building.x, y: building.y });
        return;
      }
      spots.set(
        station.id,
        stationPosition(area, index) ?? {
          x: Number(station.map_x),
          y: Number(station.map_y),
        },
      );
    });
  }
  return spots;
}

// One pin per group: best GPS fix across its Facis' phones, or its
// station check-in (see src/lib/groupPosition.ts).
export function buildGroupPins(
  positions: GroupPosition[],
  stations: Station[],
  stationSpots: Map<number, MapSpot>,
  nowMs: number,
): Map<number, GroupPin | null> {
  const spotOf = (id: number) => {
    const st = stations.find((s) => s.id === id);
    if (!st) return null;
    return stationSpots.get(id) ?? { x: Number(st.map_x), y: Number(st.map_y) };
  };
  const pins = new Map<number, GroupPin | null>();
  for (const g of positions) pins.set(g.group_id, resolveGroupPin(g, spotOf, nowMs));
  return pins;
}

// Groups at the same spot (for example checked into one station) sit side by side.
export function spreadPins(
  positions: GroupPosition[],
  groupPins: Map<number, GroupPin | null>,
): DrawnPin[] {
  const list = positions.flatMap((g) => {
    const pin = groupPins.get(g.group_id);
    return pin ? [{ g, pin }] : [];
  });
  const bySpot = new Map<string, number[]>();
  list.forEach(({ pin }, i) => {
    const key = `${Math.round(pin.pos.x * 2)}:${Math.round(pin.pos.y * 2)}`;
    bySpot.set(key, [...(bySpot.get(key) ?? []), i]);
  });
  const offsets = new Array<number>(list.length).fill(0);
  for (const idx of bySpot.values()) {
    idx.forEach((i, k) => {
      offsets[i] = (k - (idx.length - 1) / 2) * 90;
    });
  }
  return list.map((item, i) => ({ ...item, dx: offsets[i] }));
}

// FR-4.4: station status changes propagate via Realtime.
// FR-4.3: Day 2 projector layer appears only when Admin toggles it.
export function useCampusMapData({
  showGroupPins,
  canManageStations,
  bulbLayer = true,
}: {
  showGroupPins: boolean;
  canManageStations: boolean;
  /** The Lightbulbs layer (2D map only). Without it the layer stays on Stations. */
  bulbLayer?: boolean;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const myId = useProfile().id;
  const [stations, setStations] = useState<Station[]>([]);
  const [layerState, setLayerState] = useState<MapLayer>("stations");
  const layer: MapLayer = bulbLayer ? layerState : "stations";
  const [bulbs, setBulbs] = useState<MapLightbulb[]>([]);
  const [selectedBulb, setSelectedBulb] = useState<ProjectorLocation | null>(null);
  const [movingBulb, setMovingBulb] = useState<ProjectorLocation | null>(null);
  // Admin anchors (map_anchors), added to the built-in ones in mapGeo.
  // warpVersion changes when they are refitted, so pins are placed again.
  const [anchors, setAnchors] = useState<MapAnchor[]>([]);
  const [warpVersion, setWarpVersion] = useState(0);
  const [checkMode, setCheckMode] = useState(false);
  const [checkNotice, setCheckNotice] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const check = useAccuracyCheck(checkMode && canManageStations);
  const [bulbError, setBulbError] = useState<string | null>(null);
  // Lit bulbs the viewer has already seen in Lightbulbs mode; more lit than
  // this makes the Lightbulbs tab pulse.
  const [seenLit, setSeenLit] = useState<number | null>(null);
  const [positions, setPositions] = useState<GroupPosition[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selected, setSelected] = useState<Station | null>(null);
  const [openBuilding, setOpenBuilding] = useState<string | null>(null);
  // Building whose stations are listed under the map (badge tapped).
  const [clusterArea, setClusterArea] = useState<string | null>(null);
  const [resetting, setResetting] = useState<ProjectorLocation | null>(null);
  const [showNames, setShowNames] = useState(false);
  const [editing, setEditing] = useState<Station | null>(null);
  const [counts, setCounts] = useState<Record<number, number>>({});

  const activeSelected = selected
    ? (stations.find((s) => s.id === selected.id) ?? selected)
    : null;

  const loadStations = useCallback(async () => {
    const { data } = await supabase.from("stations").select("*").order("id");
    setStations((data as Station[]) ?? []);
  }, [supabase]);

  // Every map loads the Admin anchors. Before migration 0087 the table does
  // not exist; the map then keeps the built-in anchors.
  const loadAnchors = useCallback(async () => {
    const { data, error } = await supabase
      .from("map_anchors")
      .select("*")
      .order("created_at", { ascending: false });
    if (error || !data) return;
    const list = (data as MapAnchor[]).map((a) => ({
      ...a,
      x: Number(a.x),
      y: Number(a.y),
    }));
    setAnchors(list);
    setExtraAnchors(list);
    setWarpVersion((v) => v + 1);
  }, [supabase]);

  useEffect(() => {
    void loadAnchors();
  }, [loadAnchors]);

  // Admin taps where they really are (map percent): save an anchor from the averaged GPS.
  async function placeAnchor(xPct: number, yPct: number) {
    const x = Math.min(100, Math.max(0, xPct));
    const y = Math.min(100, Math.max(0, yPct));
    setCheckNotice(null);
    const fix = check.averaged();
    if (!fix) {
      setCheckError(
        "GPS too rough to save. Step into the open and wait for 2 fixes at ±20 m or better.",
      );
      return;
    }
    const predicted = gpsToMapPercent(fix.lat, fix.lng);
    if (
      predicted &&
      Math.hypot(predicted.x - x, predicted.y - y) > 25 &&
      !window.confirm(
        "That spot is far from where the map puts you. Save it anyway? A wrong tap bends the map for everyone.",
      )
    ) {
      return;
    }
    const { data, error } = await supabase.rpc("fn_admin_add_map_anchor", {
      p_lat: fix.lat,
      p_lng: fix.lng,
      p_x: Math.round(x * 100) / 100,
      p_y: Math.round(y * 100) / 100,
      p_accuracy: fix.accuracy,
      p_fixes: fix.fixes,
    });
    if (error) {
      setCheckError(friendlyError(error));
      return;
    }
    setCheckError(null);
    const replaced = (data as { replaced?: number } | null)?.replaced ?? 0;
    setCheckNotice(
      `Saved (±${Math.round(fix.accuracy)} m, ${fix.fixes} fixes)${replaced ? `, replaced ${replaced} nearby` : ""}. Every map now uses it.`,
    );
    await loadAnchors();
  }

  async function deleteAnchor(id: number) {
    if (!window.confirm("Delete this correction? Every map stops using it.")) return;
    const { error } = await supabase.rpc("fn_admin_delete_map_anchor", { p_id: id });
    setCheckError(error ? friendlyError(error) : null);
    setCheckNotice(error ? null : "Correction deleted.");
    await loadAnchors();
  }

  // 3D map: Admin taps where they really are, and sees how far the averaged GPS fix is from that spot.
  // `metresTo` measures from the tapped spot to a GPS point. Nothing is saved (anchors only bend the 2D map).
  function measureCheck(metresTo: (lat: number, lng: number) => number) {
    setCheckNotice(null);
    const fix = check.averaged();
    if (!fix) {
      setCheckError("GPS too rough to measure. Step into the open and wait for 2 fixes at ±20 m or better.");
      return;
    }
    setCheckError(null);
    setCheckNotice(
      `Your GPS is ${Math.round(metresTo(fix.lat, fix.lng))} m from where you tapped (±${Math.round(fix.accuracy)} m, ${fix.fixes} fixes).`,
    );
  }

  function startCheck() {
    setCheckMode(true);
    setCheckNotice(null);
    setCheckError(null);
  }

  const litCount = bulbs.filter((b) => b.activated_at).length;

  useEffect(() => {
    // ?layer=bulbs (from the demo scan) wins over the remembered choice.
    const fromUrl = new URLSearchParams(window.location.search).get("layer");
    const stored = fromUrl ?? readStored(LAYER_KEY);
    if (stored === "bulbs" || stored === "stations") setLayerState(stored);
    const seen = Number(readStored(SEEN_LIT_KEY));
    setSeenLit(Number.isFinite(seen) ? seen : 0);
  }, []);

  // In Lightbulbs mode every lit bulb counts as seen. A reset (fewer lit)
  // lowers the mark so the next lit bulb still pulses.
  useEffect(() => {
    if (seenLit === null) return;
    if (layer === "bulbs" ? litCount !== seenLit : litCount < seenLit) {
      setSeenLit(litCount);
      writeStored(SEEN_LIT_KEY, String(litCount));
    }
  }, [layer, litCount, seenLit]);
  const newLit = layer === "stations" && seenLit !== null && litCount > seenLit;

  function setLayer(next: MapLayer) {
    setLayerState(next);
    writeStored(LAYER_KEY, next);
    setSelected(null);
    setSelectedBulb(null);
    setMovingBulb(null);
    setOpenBuilding(null);
    setClusterArea(null);
    setBulbError(null);
  }

  async function resetBulb(loc: ProjectorLocation) {
    const b = bulbs.find((item) => item.location === loc);
    if (!b || !window.confirm(`Turn off ${bulbTitle(b)}? The group that lit it loses it.`)) {
      return;
    }
    setResetting(loc);
    const { error } = await supabase.rpc("fn_admin_reset_projector", { p_location: loc });
    setResetting(null);
    setBulbError(error ? friendlyError(error) : null);
    const { data } = await supabase.rpc("fn_map_lightbulbs");
    if (data) setBulbs(data as MapLightbulb[]);
  }

  // Admin: put the bulb being moved at this map percent.
  async function placeBulb(xPct: number, yPct: number) {
    const loc = movingBulb;
    if (!loc) return;
    const round = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
    const x = round(xPct);
    const y = round(yPct);
    setMovingBulb(null);
    // Show it at once; the realtime reload confirms it.
    setBulbs((list) => list.map((b) => (b.location === loc ? { ...b, map_x: x, map_y: y } : b)));
    const { error } = await supabase
      .from("projectors")
      .update({ map_x: x, map_y: y })
      .eq("location", loc);
    if (error) setBulbError(friendlyError(error));
    else setBulbError(null);
    const { data } = await supabase.rpc("fn_map_lightbulbs");
    if (data) setBulbs(data as MapLightbulb[]);
  }

  useEffect(() => {
    let active = true;

    async function loadStationsLive() {
      const { data } = await supabase.from("stations").select("*").order("id");
      if (active) setStations((data as Station[]) ?? []);
    }
    // Unlit bulbs come back only after the map unlocks (or for Committee);
    // fn_map_lightbulbs decides, so a bulb's place is never sent early.
    async function loadBulbs() {
      const { data } = await supabase.rpc("fn_map_lightbulbs");
      if (active && data) setBulbs(data as MapLightbulb[]);
    }
    async function loadPositions() {
      if (!showGroupPins) return;
      const { data } = await supabase.rpc("fn_group_positions");
      if (active && data) setPositions(data as GroupPosition[]);
    }
    // Up to 30 Faci phones report about twice a minute. Batch the realtime
    // events into one reload every couple of seconds.
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    function scheduleLoadPositions() {
      if (!showGroupPins || reloadTimer) return;
      reloadTimer = setTimeout(() => {
        reloadTimer = null;
        void loadPositions();
      }, 2000);
    }

    async function loadCounts() {
      const { data } = await supabase.rpc("fn_station_group_counts");
      if (!active || !data) return;
      const next: Record<number, number> = {};
      for (const row of data as { station_id: number; group_count: number }[]) {
        next[row.station_id] = row.group_count;
      }
      setCounts(next);
    }

    loadCounts();
    loadStationsLive();
    loadBulbs();
    loadPositions();

    const channel = supabase
      .channel("map-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stations" },
        loadStationsLive,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projectors" },
        loadBulbs,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_config" },
        loadBulbs,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_locations" },
        scheduleLoadPositions,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "station_occupancy" },
        () => {
          scheduleLoadPositions();
          loadCounts();
        },
      )
      .subscribe();

    // Pins fade with age, so re-check the clock even when no new report
    // arrives. Reload too, in case a realtime event was missed.
    const tick = showGroupPins
      ? setInterval(() => {
          setNowMs(Date.now());
          loadPositions();
        }, 30_000)
      : null;

    return () => {
      active = false;
      if (tick) clearInterval(tick);
      if (reloadTimer) clearTimeout(reloadTimer);
      supabase.removeChannel(channel);
    };
  }, [supabase, showGroupPins]);

  // The map shows Day 2 stations only (Day 1 stations are managed on Admin → Stations).
  const mapStations = useMemo(() => stations.filter((s) => s.day === 2), [stations]);

  const clusters = useMemo(() => buildClusters(mapStations), [mapStations]);
  const clusteredIds = useMemo(
    () => new Set(clusters.flatMap((c) => c.stations.map((s) => s.id))),
    [clusters],
  );

  const stationSpots = useMemo(() => buildStationSpots(mapStations), [mapStations]);

  const groupPins = useMemo(
    () => buildGroupPins(positions, stations, stationSpots, nowMs),
    // warpVersion: re-place the pins when Admin anchors change the warp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [positions, stations, stationSpots, nowMs, warpVersion],
  );

  const drawnPins = useMemo(() => spreadPins(positions, groupPins), [positions, groupPins]);

  const selectedPosition =
    positions.find((g) => g.group_id === selectedGroup) ?? null;
  const selectedPin =
    selectedGroup != null ? (groupPins.get(selectedGroup) ?? null) : null;

  const movingTitle = movingBulb
    ? bulbs.find((b) => b.location === movingBulb)
    : undefined;

  return {
    myId,
    nowMs,
    // Stations
    stations,
    mapStations,
    clusters,
    clusteredIds,
    stationSpots,
    counts,
    activeSelected,
    setSelected,
    openBuilding,
    setOpenBuilding,
    clusterArea,
    setClusterArea,
    editing,
    setEditing,
    showNames,
    setShowNames,
    loadStations,
    // Layer
    layer,
    setLayer,
    // Lightbulbs
    bulbs,
    litCount,
    newLit,
    selectedBulb,
    setSelectedBulb,
    movingBulb,
    setMovingBulb,
    movingTitle,
    bulbError,
    resetting,
    resetBulb,
    placeBulb,
    // Group pins
    positions,
    groupPins,
    drawnPins,
    selectedGroup,
    setSelectedGroup,
    selectedPosition,
    selectedPin,
    // Admin accuracy check and anchors
    check,
    checkMode,
    setCheckMode,
    startCheck,
    checkNotice,
    checkError,
    anchors,
    placeAnchor,
    measureCheck,
    deleteAnchor,
  };
}

export type CampusMapData = ReturnType<typeof useCampusMapData>;
