"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { readingText, useAccuracyCheck, useCheckLog } from "@/components/AccuracyCheck";
import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import { activeMapDay } from "@/lib/mapDay";
import { bulbTitle } from "@/components/LightbulbList";
import { useProfile } from "@/components/ProfileProvider";
import { useProjectorPlaces } from "@/components/useConfig";
import { funfairFromBulbs, funfairFromState, funfairMissing, type FunfairPower } from "@/lib/funfair";
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
import { parseStaffPositions, type StaffPosition } from "@/lib/staffLocation";
import { COMMITTEE_TIER } from "@/lib/types";
import { loadProjectorClues, NO_CLUES, type MapPlaces, type ProjectorClues } from "@/lib/projectorPlaces";
import { friendlyError } from "@/lib/utils";
import { gpsToMapPercent, setExtraAnchors } from "@/lib/mapGeo";

// Data and state shared by every campus map view (2D and 3D).
// Positions are percentages of the 2D Figma art (see mapBuildings.ts).

/** Stations mode shows game stations; Lightbulbs mode shows the lit (and, once unlocked, unlit) lightbulbs. */
export type MapLayer = "stations" | "bulbs";
/** Which map draws the data: the 3D campus, or the 2D art (the fallback). */
export type MapView = "3d" | "2d";
const LAYER_KEY = "campus-map-layer";
/**
 * How often the 3D map asks which funfair zones are on (a lit bulb also asks at once). Admin's overrides and keys
 * have no Realtime (only game leads can read funfair_zones), so this is how they reach other maps: within 15 s
 * (Ben), with room for the request.
 */
const FUNFAIR_POLL_MS = 10_000;
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
  const areaOf = (id: number) => stations.find((s) => s.id === id)?.area ?? null;
  const pins = new Map<number, GroupPin | null>();
  for (const g of positions) pins.set(g.group_id, resolveGroupPin(g, spotOf, areaOf, nowMs));
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
  loadFunfair = false,
}: {
  showGroupPins: boolean;
  canManageStations: boolean;
  /** The Lightbulbs layer (2D map only). Without it the layer stays on Stations. */
  bulbLayer?: boolean;
  /** Ask which funfair zones are on (the 3D map draws the funfair). */
  loadFunfair?: boolean;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const profile = useProfile();
  const myId = profile.id;
  const canSeeStaff = profile.role !== "freshie";
  const [staffPositions, setStaffPositions] = useState<StaffPosition[]>([]);
  const myGroupId = profile.group_id;
  // The station lists name the groups at a station for Committee tier; everyone else gets a count (Ben).
  const staffView = COMMITTEE_TIER.includes(profile.role);
  const [stations, setStations] = useState<Station[]>([]);
  const [layerState, setLayerState] = useState<MapLayer>("stations");
  const layer: MapLayer = bulbLayer ? layerState : "stations";
  const [bulbs, setBulbs] = useState<MapLightbulb[]>([]);
  // Where each projector stands. Staff read the config; a Freshie or Faci gets only the places their group
  // has earned (fn_my_projector_clues, 0098), and the rest stay code names (null).
  const player = profile.role === "freshie" || profile.role === "faci";
  const staffPlaces = useProjectorPlaces();
  const [clues, setClues] = useState<ProjectorClues>(NO_CLUES);
  const places: MapPlaces = player
    ? { B1: clues.B1?.place ?? null, A3: clues.A3?.place ?? null, TF: clues.TF?.place ?? null }
    : staffPlaces;
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
  const checkLog = useCheckLog();
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

  useEffect(() => {
    if (!canSeeStaff) return;
    let active = true;
    let request = 0;
    async function loadStaff() {
      const revision = ++request;
      const { data, error } = await supabase.rpc("fn_staff_positions");
      if (active && revision === request) setStaffPositions(error ? [] : parseStaffPositions(data));
    }
    void loadStaff();
    const timer = setInterval(loadStaff, 10_000);
    const onVisible = () => { if (document.visibilityState === "visible") void loadStaff(); };
    window.addEventListener("staff-location-change", loadStaff);
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; clearInterval(timer); window.removeEventListener("staff-location-change", loadStaff); document.removeEventListener("visibilitychange", onVisible); };
  }, [supabase, canSeeStaff]);

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
      `Saved (±${Math.round(fix.accuracy)} m, ${fix.fixes} fixes)${replaced ? `, replaced ${replaced} nearby` : ""}. The 2D map now uses it.`,
    );
    await loadAnchors();
  }

  async function deleteAnchor(id: number) {
    if (!window.confirm("Delete this correction? The 2D map stops using it.")) return;
    const { error } = await supabase.rpc("fn_admin_delete_map_anchor", { p_id: id });
    setCheckError(error ? friendlyError(error) : null);
    setCheckNotice(error ? null : "Correction deleted.");
    await loadAnchors();
  }

  // 3D map: Admin taps where they really are, and sees how far (and which way) the averaged GPS fix is from that
  // spot. `offsetTo` gives a GPS point's offset from the tapped spot in metres. The reading is logged on this
  // device only (anchors only bend the 2D map).
  function measureCheck(offsetTo: (lat: number, lng: number) => { east: number; north: number }) {
    setCheckNotice(null);
    const fix = check.averaged();
    if (!fix) {
      setCheckError("GPS too rough to measure. Step into the open and wait for 2 fixes at ±20 m or better.");
      return;
    }
    setCheckError(null);
    const offset = offsetTo(fix.lat, fix.lng);
    checkLog.add({ t: Date.now(), ...offset, acc: fix.accuracy, fixes: fix.fixes });
    setCheckNotice(
      `Your GPS reads ${readingText(offset)} of where you tapped (±${Math.round(fix.accuracy)} m, ${fix.fixes} fixes).`,
    );
  }

  function startCheck() {
    setCheckMode(true);
    setCheckNotice(null);
    setCheckError(null);
  }

  const litCount = bulbs.filter((b) => b.activated_at).length;

  // The funfair's zones (3D map). fn_funfair_state (0088) decides, so Admin's keys and overrides count; until
  // 0088 is applied, the default keys do (funfairFromBulbs). Asked again when the lit bulbs change (they come
  // live), every 10 s (Admin's changes reach other maps that way), and when the page comes back into view.
  const [funfairReady, setFunfairReady] = useState(false);
  const [funfairState, setFunfairState] = useState<FunfairPower | null>(null);
  const litKey = bulbs
    .filter((b) => b.activated_at)
    .map((b) => b.location)
    .sort()
    .join(",");
  useEffect(() => {
    if (!loadFunfair) return;
    let active = true;
    let missing = false;
    async function load() {
      if (missing) return;
      const { data, error } = await supabase.rpc("fn_funfair_state");
      if (!active) return;
      if (error) {
        // Not migrated yet: stop asking, the defaults decide. Other errors keep the last answer.
        if (funfairMissing(error)) {
          missing = true;
          setFunfairState(null);
          setFunfairReady(true);
        }
        return;
      }
      setFunfairReady(true);
      setFunfairState(funfairFromState((data ?? []) as { zone: string; powered: boolean }[]));
    }
    void load();
    const id = window.setInterval(load, FUNFAIR_POLL_MS);
    // Timers sleep while a phone is in another app, so ask at once on coming back instead of at the next tick.
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [supabase, loadFunfair, litKey]);
  const funfair = useMemo(() => funfairState ?? funfairFromBulbs(bulbs), [funfairState, bulbs]);

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
    if (!b || !window.confirm(`Turn off ${bulbTitle(b, places)}? The group that lit it loses it.`)) {
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
      const [{ data }, earned] = await Promise.all([
        supabase.rpc("fn_map_lightbulbs"),
        player ? loadProjectorClues(supabase) : null,
      ]);
      if (!active) return;
      if (data) setBulbs(data as MapLightbulb[]);
      // Before 0098 ("missing") a player sees code names only.
      if (earned) setClues(earned === "missing" ? NO_CLUES : earned);
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
      // Only Committee tier gets projectors events (0096); for everyone else a
      // projector change arrives as game_config 'lightbulbs_changed_at'.
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
    // arrives. Reload too, in case a realtime event was missed: every 10 s,
    // so a pin is never more than 15 s behind (Ben).
    // The stations' group counts reload on the same beat: a missed occupancy event (a check-out from another
    // phone, a dropped socket) would otherwise leave "1 groups" on the list after the station is empty.
    const tick = setInterval(() => {
      if (showGroupPins) {
        setNowMs(Date.now());
        loadPositions();
      }
      loadCounts();
    }, 10_000);

    // A phone back from another app may have missed realtime events while it slept, so reload the bulbs (a newly
    // lit one then also asks the funfair again) and the group pins.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void loadBulbs();
      setNowMs(Date.now());
      void loadPositions();
      void loadCounts();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      clearInterval(tick);
      if (reloadTimer) clearTimeout(reloadTimer);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [supabase, showGroupPins, player]);

  const { phases } = usePhaseTimer();
  const day = activeMapDay(phases);
  const mapStations = useMemo(() => stations.filter((s) => s.day === day), [stations, day]);
  useEffect(() => {
    setSelected(null);
    setOpenBuilding(null);
    setClusterArea(null);
  }, [day]);

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
    staffPositions,
    day,
    myGroupId,
    nowMs,
    // Stations
    stations,
    mapStations,
    clusters,
    clusteredIds,
    stationSpots,
    counts,
    staffView,
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
    // Projectors (lightbulbs) and where each stands (Admin → Puzzles, 0097)
    places,
    bulbs,
    litCount,
    // The funfair's zones (3D map)
    funfair,
    funfairReady,
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
    checkLog,
    deleteAnchor,
  };
}

export type CampusMapData = ReturnType<typeof useCampusMapData>;
