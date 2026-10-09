"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";

import { BuildingStationPanel } from "@/components/BuildingStationPanel";
import { StationEditDialog } from "@/components/StationEditDialog";
import { supabaseBrowser } from "@/lib/supabase/client";
import { stationDotColor } from "@/components/ui";
import type {
  GpsLocation,
  LatestLocation,
  Projector,
  Station,
} from "@/lib/types";
import {
  MAP_BUILDINGS,
  PROJECTOR_SPOTS,
  stationPosition,
} from "@/lib/mapBuildings";
import { isStale, timeAgo } from "@/lib/utils";
import { gpsPinState, gpsToMapPercent, groupPinColor } from "@/lib/mapGeo";

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
  const [stations, setStations] = useState<Station[]>([]);
  const [projectors, setProjectors] = useState<Projector[]>([]);
  const [day2Layer, setDay2Layer] = useState(false);
  const [locations, setLocations] = useState<LatestLocation[]>([]);
  const [gpsLocations, setGpsLocations] = useState<GpsLocation[]>([]);
  const [selectedGpsGroup, setSelectedGpsGroup] = useState<number | null>(null);
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

  useEffect(() => {
    let active = true;

    async function loadStationsLive() {
      const { data } = await supabase.from("stations").select("*").order("id");
      if (active) setStations((data as Station[]) ?? []);
    }
    async function loadProjectors() {
      const { data } = await supabase.from("projectors").select("*");
      if (active && data) setProjectors(data as Projector[]);
    }
    async function loadConfig() {
      const { data } = await supabase
        .from("game_config")
        .select("value")
        .eq("key", "day2_map_layer")
        .single();
      if (active) setDay2Layer(data?.value === true || data?.value === "true");
    }
    async function loadLocations() {
      if (!showGroupPins) return;
      const { data } = await supabase.rpc("fn_latest_locations");
      if (active && data) setLocations(data as LatestLocation[]);
      const gps = await supabase.rpc("fn_latest_gps_locations");
      if (active && gps.data) setGpsLocations(gps.data as GpsLocation[]);
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
    loadProjectors();
    loadConfig();
    loadLocations();

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
        loadProjectors,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_config" },
        loadConfig,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_locations" },
        loadLocations,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "station_occupancy" },
        () => {
          loadLocations();
          loadCounts();
        },
      )
      .subscribe();

    // Pins fade with age, so re-check the clock even when no new report
    // arrives. Reload too, in case a realtime event was missed.
    const tick = showGroupPins
      ? setInterval(() => {
          setNowMs(Date.now());
          loadLocations();
        }, 30_000)
      : null;

    return () => {
      active = false;
      if (tick) clearInterval(tick);
      supabase.removeChannel(channel);
    };
  }, [supabase, showGroupPins]);

  // Manual check-in pins sit on the station the group checked into.
  // GPS pins are placed by gpsToMapPercent (see src/lib/mapGeo.ts).
  const manualPins = locations.filter((l) => l.source === "manual");

  const stationSpots = useMemo(() => {
    const byArea = new Map<string, Station[]>();
    for (const station of stations) {
      const list = byArea.get(station.area) ?? [];
      list.push(station);
      byArea.set(station.area, list);
    }
    const spots = new Map<number, { x: number; y: number }>();
    for (const [area, list] of byArea) {
      list.forEach((station, index) => {
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
  }, [stations]);

  const gpsPins = useMemo(
    () =>
      gpsLocations.flatMap((g) => {
        const state = gpsPinState(g.reported_at, nowMs);
        if (state === "hidden" || g.lat == null || g.lng == null) return [];
        const pos = gpsToMapPercent(g.lat, g.lng);
        return pos ? [{ ...g, pos, state }] : [];
      }),
    [gpsLocations, nowMs],
  );
  const selectedGps =
    gpsLocations.find((g) => g.group_id === selectedGpsGroup) ?? null;

  function pinPosition(l: LatestLocation): { x: number; y: number } | null {
    const st = stations.find((s) => s.id === l.station_id);
    if (!st) return null;
    return (
      stationSpots.get(st.id) ?? { x: Number(st.map_x), y: Number(st.map_y) }
    );
  }

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

  function mapPicture(fitted: boolean) {
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
              {stations.map((s) => {
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
                      ? "In progress"
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

              {day2Layer &&
                projectors.map((p) => {
                  const spot = PROJECTOR_SPOTS[p.location] ?? {
                    x: Number(p.map_x),
                    y: Number(p.map_y),
                  };
                  const x = mx(spot.x);
                  const y = my(spot.y);
                  const fill = p.activated_at ? "#f59e0b" : "#0f766e";
                  return (
                    <g key={p.location}>
                      <text
                        x={x}
                        y={y}
                        textAnchor="middle"
                        fontSize="34"
                        fontWeight="800"
                        fill={fill}
                        stroke="#fff"
                        strokeWidth="8"
                        paintOrder="stroke"
                      >
                        {p.activated_at ? "ON" : "NFC"}
                      </text>
                      <text
                        x={x}
                        y={y + 40}
                        textAnchor="middle"
                        fontSize="28"
                        fontWeight="700"
                        fill={fill}
                        stroke="#fff"
                        strokeWidth="8"
                        paintOrder="stroke"
                      >
                        {p.activated_at ? "REVIVED" : p.location}
                      </text>
                    </g>
                  );
                })}

              {showGroupPins &&
                manualPins.map((l) => {
                  const pos = pinPosition(l);
                  if (!pos) return null;
                  const stale = isStale(l.reported_at);
                  const x = mx(pos.x);
                  const y = my(pos.y);
                  return (
                    <g key={l.group_id} opacity={stale ? 0.45 : 1}>
                      <rect
                        x={x - 36}
                        y={y + 18}
                        width="72"
                        height="36"
                        rx="12"
                        fill="#0891b2"
                      />
                      <text
                        x={x}
                        y={y + 43}
                        textAnchor="middle"
                        fontSize="24"
                        fontWeight="700"
                        fill="#fff"
                      >
                        G{l.group_id}
                      </text>
                    </g>
                  );
                })}

              {showGroupPins &&
                gpsPins.map((g) => {
                  const x = mx(g.pos.x);
                  const y = my(g.pos.y);
                  const color = groupPinColor(g.group_id);
                  const isSel = selectedGpsGroup === g.group_id;
                  return (
                    <g
                      key={`gps-${g.group_id}`}
                      opacity={g.state === "faded" ? 0.45 : 1}
                      data-map-hit
                      className="pointer-events-auto cursor-pointer"
                      onClick={() =>
                        setSelectedGpsGroup((cur) =>
                          cur === g.group_id ? null : g.group_id,
                        )
                      }
                    >
                      <title>
                        {g.group_name} · {timeAgo(g.reported_at, nowMs)}
                      </title>
                      <circle cx={x} cy={y} r="70" fill="transparent" />
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
                    </g>
                  );
                })}
            </svg>
            <div className="pointer-events-none absolute inset-0">
              {MAP_BUILDINGS.map((place) => {
                const spot = { left: `${place.x}%`, top: `${place.y}%` };
                if (!showNames) {
                  if (!canManageStations) return null;
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
                } ${canManageStations ? "cursor-pointer" : ""}`;
                if (!canManageStations) {
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

  return (
    <div>
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
                {showGroupPins && selectedGps ? (
                  <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2.5 text-sm shadow-lg">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">
                        {selectedGps.group_name}
                      </div>
                      <div className="text-xs text-ink-faint">
                        Updated {timeAgo(selectedGps.reported_at, nowMs)}
                        {selectedGps.accuracy_m != null &&
                          ` · ±${Math.round(selectedGps.accuracy_m)} m`}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="Close group details"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                      onClick={() => setSelectedGpsGroup(null)}
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

      {canManageStations && openBuilding && (
        <BuildingStationPanel
          area={openBuilding}
          stations={stations.filter((station) => station.area === openBuilding)}
          codes={stations.map((station) => station.code)}
          onClose={() => setOpenBuilding(null)}
          onChanged={loadStations}
        />
      )}

      {!(hasSelection ?? !!activeSelected) && !openBuilding && (
        <div className="card mt-3 overflow-hidden p-0">
          <h2 className="border-b border-paper-200 px-3 py-2 text-sm font-semibold">
            Available stations
          </h2>
          <ul className="divide-y divide-paper-200">
            {stations
              .filter((station) => station.status === "available")
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
                    return onStationTap ? (
                      <button
                        type="button"
                        className={`${cls} transition-colors hover:bg-paper-100`}
                        onClick={() => {
                          setSelected(station);
                          onStationTap(station);
                        }}
                      >
                        {body}
                      </button>
                    ) : (
                      <div className={cls}>{body}</div>
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
            {stations.every((station) => station.status !== "available") && (
              <li className="px-3 py-4 text-sm text-ink-faint">
                No stations are available right now.
              </li>
            )}
          </ul>
        </div>
      )}

      {activeSelected && !onStationTap && (
        <div className="card mt-3 p-3">
          <div className="mb-2.5 flex items-center justify-between border-b border-paper-200 pb-2">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-faint transition-colors hover:text-ink-base"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to available stations
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

      {showGroupPins && selectedGps && (
        <div className="card mt-3 flex items-center justify-between gap-3 p-3 text-sm">
          <div>
            <div className="font-semibold">{selectedGps.group_name}</div>
            <div className="text-xs text-ink-faint">
              Updated {timeAgo(selectedGps.reported_at, nowMs)}
              {selectedGps.accuracy_m != null &&
                ` · accuracy ±${Math.round(selectedGps.accuracy_m)} m`}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setSelectedGpsGroup(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Latest report per group, including ones too old to show on the map */}
      {showGroupPins && (
        <div className="mt-3 space-y-1">
          {locations.map((l) => (
            <div
              key={l.group_id}
              className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-sm"
            >
              <span className="font-medium">{l.group_name}</span>
              <span className="text-xs text-ink-faint">
                {l.source === "manual"
                  ? (l.station_name ?? "station")
                  : `GPS ±${Math.round(l.accuracy_m ?? 0)}m`}
                {" · "}
                <span className={isStale(l.reported_at) ? "text-red-500" : ""}>
                  {timeAgo(l.reported_at)}
                  {isStale(l.reported_at) && " (stale)"}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
