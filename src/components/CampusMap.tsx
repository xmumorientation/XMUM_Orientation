"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Crosshair, Lightbulb, MapPin, Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";

import { AccuracyCheckPanel, useAccuracyCheck } from "@/components/AccuracyCheck";
import { BuildingStationPanel } from "@/components/BuildingStationPanel";
import {
  GroupStatusList,
  pinSummary,
  reportingSummary,
} from "@/components/GroupStatusList";
import { LightbulbList, bulbStatus, bulbTitle } from "@/components/LightbulbList";
import { useProfile } from "@/components/ProfileProvider";
import { StationEditDialog } from "@/components/StationEditDialog";
import { supabaseBrowser } from "@/lib/supabase/client";
import { stationDotColor } from "@/components/ui";
import {
  PROJECTOR_CODE_NAMES,
  type GroupPosition,
  type MapAnchor,
  type MapLightbulb,
  type ProjectorLocation,
  type Station,
} from "@/lib/types";
import {
  MAP_BUILDINGS,
  stationPosition,
} from "@/lib/mapBuildings";
import { resolveGroupPin, type GroupPin } from "@/lib/groupPosition";
import { friendlyError, timeAgo } from "@/lib/utils";
import {
  accuracyAxes,
  gpsToMapPercent,
  groupPinColor,
  setExtraAnchors,
} from "@/lib/mapGeo";

// Illustrated campus map exported from the Figma frame
// "XMUM Block Cube_XMUM Map 1". Coordinates below are percentages of that image.
const MAP_SRC = "/campus-map.png";
const MAP_W = 3203;
const MAP_H = 1776;

function mx(percent: number) {
  return (percent / 100) * MAP_W;
}
function my(percent: number) {
  return (percent / 100) * MAP_H;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

type MapView = { scale: number; x: number; y: number };

/** Stations mode shows game stations; Lightbulbs mode shows the lit (and, once unlocked, unlit) lightbulbs. */
type MapLayer = "stations" | "bulbs";
const LAYER_KEY = "campus-map-layer";

/** In full screen, a building's badge splits into station dots past this zoom. */
const CLUSTER_SPLIT_ZOOM = 2.5;

/** Colour for a building badge: green if any station is open, else red if any is busy, else grey. */
function clusterStatus(list: Station[]): Station["status"] {
  if (list.some((s) => s.status === "available")) return "available";
  if (list.some((s) => s.status === "in_progress")) return "in_progress";
  return "closed";
}
const SEEN_LIT_KEY = "campus-map-seen-lit";

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
type Box = { w: number; h: number };

/** Largest size that fits the whole map inside the screen. */
function containSize(vw: number, vh: number): Box {
  if (vw <= 0 || vh <= 0) return { w: 0, h: 0 };
  const aspect = MAP_W / MAP_H;
  if (vw / vh > aspect) {
    const h = vh;
    return { w: h * aspect, h };
  }
  const w = vw;
  return { w, h: w / aspect };
}

/** Keep a zoomed map on screen. At 1x the whole picture stays centred. */
function clampView(
  v: MapView,
  vw: number,
  vh: number,
  cw: number,
  ch: number,
): MapView {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.scale));
  const sw = cw * scale;
  const sh = ch * scale;
  return {
    scale,
    x: sw <= vw ? (vw - sw) / 2 : Math.min(0, Math.max(vw - sw, v.x)),
    y: sh <= vh ? (vh - sh) / 2 : Math.min(0, Math.max(vh - sh, v.y)),
  };
}

function stationStatusText(status: Station["status"]): string {
  if (status === "available") return "Available";
  if (status === "in_progress") return "In Progress";
  return "Closed";
}

// FR-4.1: illustrated campus map (no Google Maps dependency).
// FR-4.4: station status changes propagate via Realtime.
// FR-4.3: Day 2 projector layer appears only when Admin toggles it.
export function CampusMap({
  showGroupPins = false,
  onStationTap,
  highlightStationId,
  canManageStations = false,
  hasSelection,
}: {
  showGroupPins?: boolean;
  onStationTap?: (station: Station) => void;
  highlightStationId?: number | null;
  /** Admin on the campus map page can add and edit stations per building. */
  canManageStations?: boolean;
  /** When set, the available-station list follows this instead of the map's own selection. */
  hasSelection?: boolean;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const myId = useProfile().id;
  const [stations, setStations] = useState<Station[]>([]);
  const [layer, setLayerState] = useState<MapLayer>("stations");
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
  const [view, setView] = useState<MapView>({ scale: 1, x: 0, y: 0 });
  // Full-screen viewer. The inline map stays still so the page can scroll.
  const [fullscreen, setFullscreen] = useState(false);
  const [content, setContent] = useState<Box>({ w: 0, h: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<Box>({ w: 0, h: 0 });
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
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

  // Admin taps where they really are: save an anchor from the averaged GPS.
  async function placeAnchor(e: React.MouseEvent<SVGRectElement>) {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
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

  // Admin: put the bulb being moved where the map was tapped.
  async function placeBulb(e: React.MouseEvent<SVGRectElement>) {
    const loc = movingBulb;
    const svg = e.currentTarget.ownerSVGElement;
    if (!loc || !svg) return;
    const r = svg.getBoundingClientRect();
    const round = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
    const x = round(((e.clientX - r.left) / r.width) * 100);
    const y = round(((e.clientY - r.top) / r.height) * 100);
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

  // Buildings with two or more stations show one badge instead of a dot each.
  const clusters = useMemo(() => {
    const list: { area: string; x: number; y: number; stations: Station[] }[] = [];
    for (const b of MAP_BUILDINGS) {
      const here = mapStations.filter((s) => s.area === b.area);
      if (here.length >= 2) list.push({ area: b.area, x: b.x, y: b.y, stations: here });
    }
    return list;
  }, [mapStations]);
  const clusteredIds = useMemo(
    () => new Set(clusters.flatMap((c) => c.stations.map((s) => s.id))),
    [clusters],
  );

  const stationSpots = useMemo(() => {
    const byArea = new Map<string, Station[]>();
    for (const station of mapStations) {
      const list = byArea.get(station.area) ?? [];
      list.push(station);
      byArea.set(station.area, list);
    }
    const spots = new Map<number, { x: number; y: number }>();
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
  }, [mapStations]);

  // One pin per group: best GPS fix across its Facis' phones, or its
  // station check-in (see src/lib/groupPosition.ts).
  const groupPins = useMemo(() => {
    const spotOf = (id: number) => {
      const st = stations.find((s) => s.id === id);
      if (!st) return null;
      return stationSpots.get(id) ?? { x: Number(st.map_x), y: Number(st.map_y) };
    };
    const pins = new Map<number, GroupPin | null>();
    for (const g of positions) pins.set(g.group_id, resolveGroupPin(g, spotOf, nowMs));
    return pins;
    // warpVersion: re-place the pins when Admin anchors change the warp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, stations, stationSpots, nowMs, warpVersion]);

  // Groups at the same spot (for example checked into one station) sit side by side.
  const drawnPins = useMemo(() => {
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
  }, [positions, groupPins]);

  const selectedPosition =
    positions.find((g) => g.group_id === selectedGroup) ?? null;
  const selectedPin =
    selectedGroup != null ? (groupPins.get(selectedGroup) ?? null) : null;

  // Zoom by a factor around a point given in viewport pixels.
  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    const el = viewportRef.current;
    const box = contentRef.current;
    if (!el || box.w === 0 || box.h === 0) return;
    const { width, height } = el.getBoundingClientRect();
    setView((v) => {
      const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.scale * factor));
      const k = scale / v.scale;
      return clampView(
        { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k },
        width,
        height,
        box.w,
        box.h,
      );
    });
  }, []);

  function zoomCentre(factor: number) {
    const el = viewportRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    zoomAt(factor, r.width / 2, r.height / 2);
  }

  function closeFullscreen() {
    pointers.current.clear();
    dragged.current = false;
    setFullscreen(false);
    setView({ scale: 1, x: 0, y: 0 });
  }

  function openFullscreen() {
    pointers.current.clear();
    dragged.current = false;
    setView({ scale: 1, x: 0, y: 0 });
    setFullscreen(true);
  }

  function toggleBuilding(area: string) {
    setOpenBuilding((current) => (current === area ? null : area));
    // The building panel sits on the page, under this overlay.
    if (fullscreen) closeFullscreen();
  }

  // Fit the whole map the first time the overlay is measured, and again
  // when the phone rotates. A later pinch is kept and only clamped.
  useLayoutEffect(() => {
    if (!fullscreen) return;
    const el = viewportRef.current;
    if (!el) return;

    function measure(reset: boolean) {
      const rect = el!.getBoundingClientRect();
      const size = containSize(rect.width, rect.height);
      contentRef.current = size;
      setContent(size);
      setView((v) =>
        clampView(
          reset ? { scale: 1, x: 0, y: 0 } : v,
          rect.width,
          rect.height,
          size.w,
          size.h,
        ),
      );
    }

    measure(true);
    const observer = new ResizeObserver(() => measure(false));
    observer.observe(el);
    return () => observer.disconnect();
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;
    closeButtonRef.current?.focus();
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;
    const scrollY = window.scrollY;
    const { style } = document.body;
    const previous = {
      position: style.position,
      top: style.top,
      width: style.width,
      overflow: style.overflow,
    };
    style.position = "fixed";
    style.top = `-${scrollY}px`;
    style.width = "100%";
    style.overflow = "hidden";
    return () => {
      style.position = previous.position;
      style.top = previous.top;
      style.width = previous.width;
      style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [fullscreen]);

  // Wheel zoom needs a non-passive listener so the page does not scroll too.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !fullscreen) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const r = el!.getBoundingClientRect();
      zoomAt(
        Math.exp(-e.deltaY * 0.0015),
        e.clientX - r.left,
        e.clientY - r.top,
      );
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeFullscreen();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragged.current = false;
      dragStart.current = { x: e.clientX, y: e.clientY };
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const prev = pointers.current.get(e.pointerId);
    const el = viewportRef.current;
    const box = contentRef.current;
    if (!prev || !el || box.w === 0) return;
    const rect = el.getBoundingClientRect();
    const next = { x: e.clientX, y: e.clientY };

    if (pointers.current.size >= 2) {
      // Pinch: compare the distance between the two fingers before and after.
      const other = [...pointers.current.entries()].find(
        ([id]) => id !== e.pointerId,
      )?.[1];
      pointers.current.set(e.pointerId, next);
      if (!other) return;
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);
      if (before > 0 && after > 0) {
        dragged.current = true;
        zoomAt(
          after / before,
          (next.x + other.x) / 2 - rect.left,
          (next.y + other.y) / 2 - rect.top,
        );
      }
      return;
    }

    pointers.current.set(e.pointerId, next);
    const start = dragStart.current;
    if (!dragged.current && start) {
      // A small wobble is still a tap, so station dots stay clickable.
      if (Math.hypot(next.x - start.x, next.y - start.y) < 8) return;
      dragged.current = true;
      el.setPointerCapture(e.pointerId);
    }
    if (!dragged.current) return;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    setView((v) =>
      clampView(
        { ...v, x: v.x + dx, y: v.y + dy },
        rect.width,
        rect.height,
        box.w,
        box.h,
      ),
    );
  }

  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
  }

  function layerSwitch(dark: boolean) {
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
        {tab("bulbs", "Lightbulbs", Lightbulb)}
      </div>
    );
  }

  // Full screen: zoom in on a spot (percent of the map) so a badge splits into dots.
  function zoomToSpot(xPct: number, yPct: number) {
    const el = viewportRef.current;
    const box = contentRef.current;
    if (!el || box.w === 0) return;
    const { width, height } = el.getBoundingClientRect();
    const scale = Math.max(CLUSTER_SPLIT_ZOOM + 0.5, view.scale);
    setView(
      clampView(
        {
          scale,
          x: width / 2 - (xPct / 100) * box.w * scale,
          y: height / 2 - (yPct / 100) * box.h * scale,
        },
        width,
        height,
        box.w,
        box.h,
      ),
    );
  }

  function openCluster(area: string, fitted: boolean, x: number, y: number) {
    setSelected(null);
    if (fitted) {
      zoomToSpot(x, y);
      return;
    }
    if (canManageStations) {
      toggleBuilding(area);
      return;
    }
    setClusterArea((cur) => (cur === area ? null : area));
  }

  function mapPicture(fitted: boolean) {
    // The inline map always groups busy buildings; full screen splits them when zoomed in.
    const split = fitted && view.scale >= CLUSTER_SPLIT_ZOOM;
    // The inline map and the full-screen map are both in the page, so ids differ.
    const glowId = fitted ? "bulb-glow-full" : "bulb-glow-inline";
    return (
      <>
            <img
              src={MAP_SRC}
              alt="XMUM campus map"
              draggable={false}
              className={fitted ? "block h-full w-full" : "block h-auto w-full"}
            />
            <svg
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              preserveAspectRatio="xMidYMid meet"
              className="pointer-events-none absolute inset-0 h-full w-full"
              role="img"
              aria-label="Game stations on the campus map"
            >
              <defs>
                <radialGradient id={glowId}>
                  <stop offset="0%" stopColor="#fde68a" stopOpacity="0.9" />
                  <stop offset="55%" stopColor="#fbbf24" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                </radialGradient>
              </defs>
              {MAP_BUILDINGS.map((place) => (
                <ellipse
                  key={place.area}
                  cx={mx(place.x)}
                  cy={my(place.y)}
                  rx={openBuilding === place.area ? 110 : 86}
                  ry={openBuilding === place.area ? 64 : 50}
                  fill={openBuilding === place.area ? "#f59e0b33" : "#ffffff24"}
                  stroke={openBuilding === place.area ? "#f59e0b" : "#fff7ed"}
                  strokeWidth={openBuilding === place.area ? 10 : 7}
                />
              ))}
              {layer === "stations" &&
                !split &&
                clusters.map((c) => {
                  const cx = mx(c.x);
                  const cy = my(c.y);
                  const open = c.stations.filter((st) => st.status === "available").length;
                  const color = stationDotColor(clusterStatus(c.stations));
                  const isSel =
                    clusterArea === c.area ||
                    openBuilding === c.area ||
                    c.stations.some(
                      (st) => st.id === activeSelected?.id || st.id === highlightStationId,
                    );
                  return (
                    <g
                      key={`cluster-${c.area}`}
                      data-map-hit
                      className="pointer-events-auto cursor-pointer"
                      onClick={() => openCluster(c.area, fitted, c.x, c.y)}
                    >
                      <title>
                        {c.area}: {open} of {c.stations.length} stations open
                      </title>
                      <circle cx={cx} cy={cy} r="62" fill="transparent" />
                      {/* A second disc peeking out behind says "several stations here". */}
                      <circle
                        cx={cx + 14}
                        cy={cy - 12}
                        r="40"
                        fill={color}
                        opacity="0.55"
                        stroke="#fff"
                        strokeWidth="6"
                      />
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isSel ? 50 : 42}
                        fill={color}
                        stroke={isSel ? "#1c1917" : "#fff"}
                        strokeWidth="8"
                      />
                      {open > 0 ? (
                        <text
                          x={cx}
                          y={cy + 19}
                          textAnchor="middle"
                          fontSize="54"
                          fontWeight="800"
                          fill="#fff"
                        >
                          {open}
                        </text>
                      ) : clusterStatus(c.stations) === "in_progress" ? (
                        <circle cx={cx} cy={cy} r="19" fill="#fff" />
                      ) : (
                        <>
                          <line x1={cx - 23} y1={cy - 23} x2={cx + 23} y2={cy + 23} stroke="#fff" strokeWidth="7" />
                          <line x1={cx - 23} y1={cy + 23} x2={cx + 23} y2={cy - 23} stroke="#fff" strokeWidth="7" />
                        </>
                      )}
                    </g>
                  );
                })}
              {layer === "stations" && mapStations.map((s) => {
                if (!split && clusteredIds.has(s.id)) return null;
                // "TBD" = no location chosen yet; it has no place on the map
                // (it is still in the station list).
                if (s.area === "TBD") return null;
                const spot = stationSpots.get(s.id) ?? {
                  x: Number(s.map_x),
                  y: Number(s.map_y),
                };
                const cx = mx(spot.x);
                const cy = my(spot.y);
                const r =
                  highlightStationId === s.id || activeSelected?.id === s.id
                    ? 52
                    : 36;
                const statusLabel =
                  s.status === "available"
                    ? "Available"
                    : s.status === "in_progress"
                      ? "In Progress"
                      : "Closed";
                return (
                  <g
                    key={s.id}
                    onClick={() => {
                      setSelected((current) =>
                        current?.id === s.id ? null : s,
                      );
                      onStationTap?.(s);
                    }}
                    data-map-hit
                    className="pointer-events-auto cursor-pointer"
                  >
                    {/* Status is conveyed by shape as well as colour:
                      available = solid, in progress = ring, closed = crossed. */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={Math.max(r + 48, 110)}
                      fill="transparent"
                    />
                    <title>
                      {s.code} · {s.name}
                      {s.purpose ? ` · ${s.purpose}` : ""} · {statusLabel}
                    </title>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={stationDotColor(s.status)}
                      stroke="#fff"
                      strokeWidth="8"
                    />
                    {s.status === "in_progress" && (
                      <circle cx={cx} cy={cy} r={r * 0.45} fill="#fff" />
                    )}
                    {s.status === "closed" && (
                      <>
                        <line
                          x1={cx - r * 0.55}
                          y1={cy - r * 0.55}
                          x2={cx + r * 0.55}
                          y2={cy + r * 0.55}
                          stroke="#fff"
                          strokeWidth="7"
                        />
                        <line
                          x1={cx - r * 0.55}
                          y1={cy + r * 0.55}
                          x2={cx + r * 0.55}
                          y2={cy - r * 0.55}
                          stroke="#fff"
                          strokeWidth="7"
                        />
                      </>
                    )}
                    {showNames && (
                      <text
                        x={cx}
                        y={cy - r - 10}
                        textAnchor="middle"
                        fontSize="32"
                        fontWeight="700"
                        fill="#1c1917"
                        stroke="#fff"
                        strokeWidth="8"
                        paintOrder="stroke"
                      >
                        {s.code}
                      </text>
                    )}
                  </g>
                );
              })}

              {layer === "bulbs" &&
                bulbs.map((b) => {
                  const x = mx(Number(b.map_x));
                  const y = my(Number(b.map_y));
                  const lit = !!b.activated_at;
                  const isSel = selectedBulb === b.location;
                  return (
                    <g
                      key={b.location}
                      data-map-hit
                      className="pointer-events-auto cursor-pointer"
                      onClick={() =>
                        setSelectedBulb((cur) => (cur === b.location ? null : b.location))
                      }
                    >
                      <title>
                        {bulbTitle(b)} · {bulbStatus(b, nowMs)}
                      </title>
                      <circle cx={x} cy={y + 20} r="110" fill="transparent" />
                      {lit && (
                        <>
                          <circle
                            cx={x}
                            cy={y - 4}
                            r="120"
                            fill={`url(#${glowId})`}
                            className="animate-pulse"
                          />
                          {/* Rays round the glass (none below, where the base is). */}
                          {[-90, -45, 0, 180, 225].map((deg) => {
                            const a = (deg * Math.PI) / 180;
                            return (
                              <line
                                key={deg}
                                x1={x + Math.cos(a) * 64}
                                y1={y - 6 + Math.sin(a) * 64}
                                x2={x + Math.cos(a) * 86}
                                y2={y - 6 + Math.sin(a) * 86}
                                stroke="#f59e0b"
                                strokeWidth="9"
                                strokeLinecap="round"
                              />
                            );
                          })}
                        </>
                      )}
                      {/* Glass: pear shape, centred on the spot, narrowing to the neck. */}
                      <path
                        d={`M ${x - 21} ${y + 40} C ${x - 21} ${y + 26} ${x - 46} ${y + 12} ${x - 46} ${y - 8} A 46 46 0 1 1 ${x + 46} ${y - 8} C ${x + 46} ${y + 12} ${x + 21} ${y + 26} ${x + 21} ${y + 40} Z`}
                        fill={lit ? "#fcd34d" : "#e7e5e4"}
                        stroke={isSel ? "#1c1917" : lit ? "#b45309" : "#a8a29e"}
                        strokeWidth={isSel ? 9 : 6}
                        strokeLinejoin="round"
                      />
                      {/* Inner warm core when lit. */}
                      {lit && <circle cx={x} cy={y - 6} r="28" fill="#fef3c7" opacity="0.9" />}
                      {/* Shine. */}
                      <path
                        d={`M ${x - 30} ${y - 14} A 32 32 0 0 1 ${x - 10} ${y - 38}`}
                        fill="none"
                        stroke="#fff"
                        strokeWidth="7"
                        strokeLinecap="round"
                        opacity={lit ? 0.95 : 0.8}
                      />
                      {/* Filament: two wires up from the neck, a coil across the top. */}
                      <path
                        d={`M ${x - 11} ${y + 40} L ${x - 11} ${y + 4} L ${x - 6} ${y - 6} L ${x - 1} ${y + 4} L ${x + 4} ${y - 6} L ${x + 9} ${y + 4} L ${x + 11} ${y + 4} L ${x + 11} ${y + 40}`}
                        fill="none"
                        stroke={lit ? "#ea580c" : "#78716c"}
                        strokeWidth="4.5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                      {/* Screw base with threads and a contact tip. */}
                      <rect
                        x={x - 23}
                        y={y + 38}
                        width="46"
                        height="30"
                        rx="6"
                        fill={lit ? "#a8a29e" : "#78716c"}
                        stroke="#fff"
                        strokeWidth="4"
                      />
                      <line x1={x - 21} y1={y + 48} x2={x + 21} y2={y + 46} stroke="#57534e" strokeWidth="3" />
                      <line x1={x - 21} y1={y + 58} x2={x + 21} y2={y + 56} stroke="#57534e" strokeWidth="3" />
                      <path
                        d={`M ${x - 12} ${y + 68} L ${x + 12} ${y + 68} L ${x + 6} ${y + 78} L ${x - 6} ${y + 78} Z`}
                        fill="#44403c"
                        stroke="#fff"
                        strokeWidth="3"
                        strokeLinejoin="round"
                      />
                      {!lit && (
                        <text
                          x={x}
                          y={y - 18}
                          textAnchor="middle"
                          fontSize="30"
                          fontWeight="800"
                          fill="#78716c"
                        >
                          ?
                        </text>
                      )}
                      <text
                        x={x}
                        y={y + 112}
                        textAnchor="middle"
                        fontSize="30"
                        fontWeight="800"
                        fill={lit ? "#b45309" : "#57534e"}
                        stroke="#fff"
                        strokeWidth="8"
                        paintOrder="stroke"
                      >
                        {PROJECTOR_CODE_NAMES[b.location]}
                        {lit && b.activated_by_group != null ? ` · G${b.activated_by_group}` : ""}
                      </text>
                    </g>
                  );
                })}

              {layer === "bulbs" && movingBulb && (
                <rect
                  x="0"
                  y="0"
                  width={MAP_W}
                  height={MAP_H}
                  fill="#f59e0b"
                  fillOpacity="0.08"
                  data-map-hit
                  className="pointer-events-auto cursor-crosshair"
                  onClick={placeBulb}
                />
              )}

              {showGroupPins &&
                drawnPins.map(({ g, pin, dx }) => {
                  const x = mx(pin.pos.x) + dx;
                  const y = my(pin.pos.y);
                  const color =
                    pin.state === "stale" ? "#9ca3af" : groupPinColor(g.group_id);
                  const isSel = selectedGroup === g.group_id;
                  const halo =
                    pin.source === "gps" &&
                    pin.imprecise &&
                    pin.accuracyM != null &&
                    g.gps_lat != null
                      ? accuracyAxes(g.gps_lat, pin.accuracyM)
                      : null;
                  return (
                    <g
                      key={`group-${g.group_id}`}
                      opacity={pin.state === "faded" ? 0.6 : 1}
                      data-map-hit
                      className="pointer-events-auto cursor-pointer"
                      onClick={() =>
                        setSelectedGroup((cur) =>
                          cur === g.group_id ? null : g.group_id,
                        )
                      }
                    >
                      <title>
                        {g.group_name} · {pinSummary(g, pin, nowMs)}
                      </title>
                      {halo && (
                        <circle
                          r="1"
                          transform={`matrix(${(halo.east.x / 100) * MAP_W} ${(halo.east.y / 100) * MAP_H} ${(halo.north.x / 100) * MAP_W} ${(halo.north.y / 100) * MAP_H} ${x} ${y})`}
                          fill={color}
                          fillOpacity="0.14"
                          stroke={color}
                          strokeWidth="2"
                          strokeDasharray="6 4"
                          vectorEffect="non-scaling-stroke"
                          className="pointer-events-none"
                        />
                      )}
                      <circle cx={x} cy={y - 40} r="70" fill="transparent" />
                      <path
                        d={`M ${x} ${y} L ${x - 22} ${y - 38} L ${x + 22} ${y - 38} Z`}
                        fill={color}
                      />
                      <circle
                        cx={x}
                        cy={y - 62}
                        r={isSel ? 44 : 38}
                        fill={color}
                        stroke="#fff"
                        strokeWidth="8"
                        strokeDasharray={halo ? "14 10" : undefined}
                      />
                      <text
                        x={x}
                        y={y - 51}
                        textAnchor="middle"
                        fontSize="32"
                        fontWeight="800"
                        fill="#fff"
                      >
                        {g.group_id}
                      </text>
                      {pin.source === "manual" && (
                        <rect
                          x={x + 22}
                          y={y - 104}
                          width="24"
                          height="24"
                          rx="6"
                          fill="#0891b2"
                          stroke="#fff"
                          strokeWidth="5"
                        />
                      )}
                    </g>
                  );
                })}
              {checkMode && canManageStations && (
                <>
                  {anchors.map((an) => (
                    <rect
                      key={`anchor-${an.id}`}
                      x={mx(an.x) - 14}
                      y={my(an.y) - 14}
                      width="28"
                      height="28"
                      transform={`rotate(45 ${mx(an.x)} ${my(an.y)})`}
                      fill="#0ea5e9"
                      stroke="#fff"
                      strokeWidth="5"
                    />
                  ))}
                  {check.others
                    .filter((o) => !check.live || o.user_id !== myId)
                    .map((o) => {
                      const p = gpsToMapPercent(o.lat, o.lng);
                      if (!p) return null;
                      return (
                        <g key={`admin-${o.user_id}`}>
                          <circle cx={mx(p.x)} cy={my(p.y)} r="26" fill="#334155" stroke="#fff" strokeWidth="6" />
                          <text x={mx(p.x)} y={my(p.y) + 62} textAnchor="middle" fontSize="28" fontWeight="800" fill="#334155" stroke="#fff" strokeWidth="7" paintOrder="stroke">
                            {o.full_name ?? "Admin"}
                          </text>
                        </g>
                      );
                    })}
                  {check.live &&
                    (() => {
                      const p = gpsToMapPercent(check.live.lat, check.live.lng);
                      if (!p) return null;
                      const cx = mx(p.x);
                      const cy = my(p.y);
                      const halo = accuracyAxes(check.live.lat, check.live.acc);
                      return (
                        <g className="pointer-events-none">
                          <circle
                            r="1"
                            transform={`matrix(${(halo.east.x / 100) * MAP_W} ${(halo.east.y / 100) * MAP_H} ${(halo.north.x / 100) * MAP_W} ${(halo.north.y / 100) * MAP_H} ${cx} ${cy})`}
                            fill="#0ea5e9"
                            fillOpacity="0.15"
                            stroke="#0284c7"
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                          />
                          <circle cx={cx} cy={cy} r="24" fill="#0284c7" stroke="#fff" strokeWidth="7" />
                          <text x={cx} y={cy - 40} textAnchor="middle" fontSize="30" fontWeight="800" fill="#0369a1" stroke="#fff" strokeWidth="8" paintOrder="stroke">
                            You
                          </text>
                        </g>
                      );
                    })()}
                  {!movingBulb && (
                    <rect
                      x="0"
                      y="0"
                      width={MAP_W}
                      height={MAP_H}
                      fill="#0ea5e9"
                      fillOpacity="0.06"
                      data-map-hit
                      className="pointer-events-auto cursor-crosshair"
                      onClick={placeAnchor}
                    />
                  )}
                </>
              )}
            </svg>
            <div className="pointer-events-none absolute inset-0">
              {MAP_BUILDINGS.map((place) => {
                const spot = { left: `${place.x}%`, top: `${place.y}%` };
                const manage = canManageStations && layer === "stations";
                if (!showNames) {
                  if (!manage) return null;
                  return (
                    <button
                      key={place.area}
                      type="button"
                      aria-label={place.area}
                      aria-pressed={openBuilding === place.area}
                      className="pointer-events-auto absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={spot}
                      onClick={() => toggleBuilding(place.area)}
                    />
                  );
                }
                const className = `pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-white/95 px-1.5 py-0.5 text-[10px] font-bold leading-none text-stone-900 shadow-sm ring-1 sm:px-2 sm:text-xs ${
                  openBuilding === place.area
                    ? "ring-2 ring-stone-900"
                    : "ring-black/15"
                } ${manage ? "cursor-pointer" : ""}`;
                if (!manage) {
                  return (
                    <span key={place.area} className={className} style={spot}>
                      {place.area}
                    </span>
                  );
                }
                return (
                  <button
                    key={place.area}
                    type="button"
                    className={className}
                    style={spot}
                    aria-pressed={openBuilding === place.area}
                    onClick={() => toggleBuilding(place.area)}
                  >
                    {place.area}
                  </button>
                );
              })}
            </div>
      </>
    );
  }

  const movingTitle = movingBulb
    ? bulbs.find((b) => b.location === movingBulb)
    : undefined;

  return (
    <div>
      <div className="mb-2 flex justify-center" aria-hidden={fullscreen}>
        {layerSwitch(false)}
      </div>
      {canManageStations && !checkMode && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setCheckMode(true);
              setCheckNotice(null);
              setCheckError(null);
            }}
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
          error={checkError ?? check.error}
          notice={checkNotice}
          anchors={anchors}
          nowMs={nowMs}
          onDelete={deleteAnchor}
          onClose={() => setCheckMode(false)}
        />
      )}
      {movingTitle && (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-950 ring-1 ring-amber-200">
          <span>
            Tap the map where the {bulbTitle(movingTitle)} NFC card is. Use full screen for a precise spot.
          </span>
          <button
            type="button"
            className="shrink-0 font-semibold underline"
            onClick={() => setMovingBulb(null)}
          >
            Cancel
          </button>
        </div>
      )}
      <div className="card overflow-hidden p-0" aria-hidden={fullscreen}>
        <div
          className="relative cursor-pointer select-none"
          onClick={(e) => {
            const target = e.target as Element;
            if (target.closest("button, [data-map-hit]")) return;
            openFullscreen();
          }}
        >
          <div className="relative">{mapPicture(false)}</div>
          <button
            type="button"
            className="absolute right-2 top-2 z-10 inline-flex h-11 items-center rounded-full bg-white/95 px-3 text-xs font-bold text-stone-900 shadow-sm ring-1 ring-black/15"
            aria-pressed={showNames}
            onClick={() => setShowNames((current) => !current)}
          >
            {showNames ? "Hide names" : "Show names"}
          </button>
          <button
            type="button"
            className="absolute bottom-2 left-2 z-10 inline-flex h-10 items-center gap-1.5 rounded-full bg-black/75 px-3 text-xs font-semibold text-white"
            onClick={openFullscreen}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Full screen
          </button>
        </div>
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
      </div>


      {fullscreen &&
        createPortal(
          <div
            ref={viewportRef}
            role="dialog"
            aria-modal="true"
            aria-label="Campus map"
            className="fixed left-0 top-0 z-[80] h-dvh w-full cursor-grab touch-none select-none overflow-hidden overscroll-none bg-stone-950 active:cursor-grabbing"
            style={{ touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onContextMenu={(e) => e.preventDefault()}
            onClickCapture={(e) => {
              if (dragged.current) {
                e.stopPropagation();
                e.preventDefault();
                dragged.current = false;
              }
            }}
          >
            <div
              className="absolute left-0 top-0 origin-top-left will-change-transform"
              style={{
                width: content.w || undefined,
                height: content.h || undefined,
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              }}
            >
              {mapPicture(true)}
            </div>

            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 px-3"
              style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                ref={closeButtonRef}
                className="pointer-events-auto inline-flex h-12 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-bold text-stone-900 shadow-lg"
                onClick={closeFullscreen}
              >
                <X className="h-5 w-5" />
                Close
              </button>
              <button
                type="button"
                className="pointer-events-auto inline-flex h-12 items-center rounded-full bg-white px-4 text-sm font-bold text-stone-900 shadow-lg"
                aria-pressed={showNames}
                onClick={() => setShowNames((current) => !current)}
              >
                {showNames ? "Hide names" : "Show names"}
              </button>
            </div>
            <div
              className="pointer-events-auto absolute inset-x-0 z-10 flex justify-center px-3"
              style={{ top: "calc(max(0.75rem, env(safe-area-inset-top)) + 3.5rem)" }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {layerSwitch(true)}
            </div>

            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 px-3"
              style={{
                paddingBottom:
                  onStationTap && activeSelected
                    ? "calc(8.5rem + env(safe-area-inset-bottom))"
                    : "max(0.75rem, env(safe-area-inset-bottom))",
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="min-w-0 flex-1">
                {checkMode && canManageStations && !movingTitle ? (
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
                      Tap where the {bulbTitle(movingTitle)} NFC card is.
                    </span>
                    <button
                      type="button"
                      className="shrink-0 font-semibold underline"
                      onClick={() => setMovingBulb(null)}
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
                          <div className="truncate font-semibold">{bulbTitle(b)}</div>
                          <div className="truncate text-xs text-ink-faint">
                            {bulbStatus(b, nowMs)}
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label="Close lightbulb details"
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                          onClick={() => setSelectedBulb(null)}
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
                      onClick={() => setSelectedGroup(null)}
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
                      </div>
                      <button
                        type="button"
                        aria-label="Close station details"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                        onClick={() => setSelected(null)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : view.scale <= 1.05 ? (
                  <p className="inline-flex rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white">
                    Drag to move · Pinch to zoom
                  </p>
                ) : (
                  <span />
                )}
              </div>
              <div className="pointer-events-auto flex shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-lg">
                <button
                  type="button"
                  aria-label="Zoom in"
                  className="flex h-12 w-12 items-center justify-center text-stone-900 disabled:opacity-30"
                  disabled={view.scale >= MAX_ZOOM}
                  onClick={() => zoomCentre(1.5)}
                >
                  <Plus className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label="Zoom out"
                  className="flex h-12 w-12 items-center justify-center border-t border-black/10 text-stone-900 disabled:opacity-30"
                  disabled={view.scale <= MIN_ZOOM}
                  onClick={() => zoomCentre(1 / 1.5)}
                >
                  <Minus className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label="Reset view"
                  className="flex h-12 w-12 items-center justify-center border-t border-black/10 text-stone-900 disabled:opacity-30"
                  disabled={view.scale <= MIN_ZOOM + 0.001}
                  onClick={() => {
                    const el = viewportRef.current;
                    const box = contentRef.current;
                    if (!el || box.w === 0) return;
                    const rect = el.getBoundingClientRect();
                    setView(
                      clampView(
                        { scale: 1, x: 0, y: 0 },
                        rect.width,
                        rect.height,
                        box.w,
                        box.h,
                      ),
                    );
                  }}
                >
                  <RotateCcw className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {canManageStations && (
        <StationEditDialog
          station={editing}
          onClose={() => setEditing(null)}
          onSaved={loadStations}
        />
      )}

      {canManageStations && layer === "stations" && openBuilding && (
        <BuildingStationPanel
          area={openBuilding}
          stations={mapStations.filter((station) => station.area === openBuilding)}
          codes={stations.map((station) => station.code)}
          onClose={() => setOpenBuilding(null)}
          onChanged={loadStations}
        />
      )}

      {layer === "bulbs" && (
        <>
          {bulbError && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              Lightbulb not changed: {bulbError}
            </p>
          )}
          <LightbulbList
            bulbs={bulbs}
            nowMs={nowMs}
            selected={selectedBulb}
            onSelect={(loc) => setSelectedBulb((cur) => (cur === loc ? null : loc))}
            canMove={canManageStations}
            moving={movingBulb}
            onMove={setMovingBulb}
            resetting={resetting}
            onReset={resetBulb}
          />
        </>
      )}

      {layer === "stations" && !(hasSelection ?? !!activeSelected) && !openBuilding && (
        <div className="card mt-3 overflow-hidden p-0">
          {clusterArea ? (
            <div className="flex items-center justify-between gap-3 border-b border-paper-200 px-3 py-2">
              <h2 className="text-sm font-semibold">
                {clusterArea} stations
              </h2>
              <button
                type="button"
                onClick={() => setClusterArea(null)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-ink-faint hover:text-ink-base"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                All available
              </button>
            </div>
          ) : (
            <h2 className="border-b border-paper-200 px-3 py-2 text-sm font-semibold">
              Available stations
            </h2>
          )}
          <ul className="divide-y divide-paper-200">
            {mapStations
              .filter((station) =>
                clusterArea
                  ? station.area === clusterArea
                  : station.status === "available",
              )
              .map((station) => (
                <li key={station.id} className="flex items-center">
                  {(() => {
                    const body = (
                      <>
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span className="w-14 shrink-0 font-bold">
                            {station.code}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">
                              {station.name}
                            </span>
                            <span className="block truncate text-xs text-ink-faint">
                              {station.area}
                              {station.purpose ? ` · ${station.purpose}` : ""}
                            </span>
                          </span>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-ink-soft">
                          {counts[station.id] ?? 0}
                          {station.max_groups != null
                            ? ` / ${station.max_groups}`
                            : ""}{" "}
                          groups
                        </span>
                        <span
                          className="chip shrink-0"
                          style={{
                            backgroundColor:
                              stationDotColor(station.status) + "22",
                            color: stationDotColor(station.status),
                          }}
                        >
                          {stationStatusText(station.status)}
                        </span>
                      </>
                    );
                    const cls =
                      "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left";
                    return (
                      <button
                        type="button"
                        className={`${cls} transition-colors hover:bg-paper-100`}
                        onClick={() => {
                          setSelected(station);
                          onStationTap?.(station);
                        }}
                      >
                        {body}
                      </button>
                    );
                  })()}
                  {canManageStations && (
                    <button
                      type="button"
                      className="mr-3 shrink-0 rounded-lg border border-paper-200 px-3 py-1 text-xs font-semibold hover:bg-paper-100"
                      onClick={() => setEditing(station)}
                    >
                      Edit
                    </button>
                  )}
                </li>
              ))}
            {!clusterArea &&
              mapStations.every((station) => station.status !== "available") && (
              <li className="px-3 py-4 text-sm text-ink-faint">
                No stations are available right now.
              </li>
            )}
          </ul>
        </div>
      )}

      {layer === "stations" && activeSelected && !onStationTap && (
        <div className="card mt-3 p-3">
          <div className="mb-2.5 flex items-center justify-between border-b border-paper-200 pb-2">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-faint transition-colors hover:text-ink-base"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {clusterArea ? `Back to ${clusterArea} stations` : "Back to available stations"}
            </button>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Back to available stations"
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
            onClick={() => setSelectedGroup(null)}
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
          onSelect={(id) => setSelectedGroup(id)}
        />
      )}
    </div>
  );
}
