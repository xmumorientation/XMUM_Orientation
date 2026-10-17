"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";

import { pinSummary } from "@/components/GroupStatusList";
import { bulbStatus, bulbTitle } from "@/components/LightbulbList";
import { stationDotColor } from "@/components/ui";
import { PROJECTOR_CODE_NAMES, type Station } from "@/lib/types";
import { MAP_BUILDINGS } from "@/lib/mapBuildings";
import { accuracyAxes, gpsToMapPercent, groupPinColor } from "@/lib/mapGeo";

import { LayerSwitch, MapInfoCard } from "./CampusMapPanels";
import { clusterStatus, type CampusMapData } from "./useCampusMapData";

/** What a map view (2D or 3D) gets from CampusMap. */
export type CampusMapViewProps = {
  data: CampusMapData;
  showGroupPins: boolean;
  canManageStations: boolean;
  highlightStationId?: number | null;
  onStationTap?: (station: Station) => void;
  /** Full-screen viewer, owned by CampusMap so the page around it can hide from screen readers. */
  fullscreen: boolean;
  onFullscreenChange: (open: boolean) => void;
  /** Key drawn under the inline map, inside its card. */
  legend: ReactNode;
};

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

/** In full screen, a building's badge splits into station dots past this zoom. */
const CLUSTER_SPLIT_ZOOM = 2.5;

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

/** Map percent of a click on the overlay SVG. */
function svgPercent(e: React.MouseEvent<SVGRectElement>) {
  const svg = e.currentTarget.ownerSVGElement;
  if (!svg) return null;
  const r = svg.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * 100,
    y: ((e.clientY - r.top) / r.height) * 100,
  };
}

// FR-4.1: illustrated campus map (no Google Maps dependency).
// The 2D view: the Figma image with overlays at percent positions, an inline
// card that stays still so the page can scroll, and a full-screen viewer
// with drag, pinch and wheel zoom.
export function CampusMap2DView({
  data,
  showGroupPins,
  canManageStations,
  highlightStationId,
  onStationTap,
  fullscreen,
  onFullscreenChange,
  legend,
}: CampusMapViewProps) {
  const {
    myId,
    nowMs,
    layer,
    mapStations,
    clusters,
    clusteredIds,
    stationSpots,
    activeSelected,
    openBuilding,
    clusterArea,
    showNames,
    bulbs,
    selectedBulb,
    movingBulb,
    movingTitle,
    drawnPins,
    selectedGroup,
    check,
    checkMode,
    anchors,
  } = data;
  const [view, setView] = useState<MapView>({ scale: 1, x: 0, y: 0 });
  const [content, setContent] = useState<Box>({ w: 0, h: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<Box>({ w: 0, h: 0 });
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  // Admin taps where they really are: save an anchor from the averaged GPS.
  function placeAnchor(e: React.MouseEvent<SVGRectElement>) {
    const p = svgPercent(e);
    if (p) void data.placeAnchor(p.x, p.y);
  }

  // Admin: put the bulb being moved where the map was tapped.
  function placeBulb(e: React.MouseEvent<SVGRectElement>) {
    const p = svgPercent(e);
    if (p) void data.placeBulb(p.x, p.y);
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
    onFullscreenChange(false);
    setView({ scale: 1, x: 0, y: 0 });
  }

  function openFullscreen() {
    pointers.current.clear();
    dragged.current = false;
    setView({ scale: 1, x: 0, y: 0 });
    onFullscreenChange(true);
  }

  function toggleBuilding(area: string) {
    data.setOpenBuilding((current) => (current === area ? null : area));
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
    // closeFullscreen uses refs and setters only (onFullscreenChange is CampusMap's setState).
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    data.setSelected(null);
    if (fitted) {
      zoomToSpot(x, y);
      return;
    }
    if (canManageStations) {
      toggleBuilding(area);
      return;
    }
    data.setClusterArea((cur) => (cur === area ? null : area));
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
                      data.setSelected((current) =>
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
                        data.setSelectedBulb((cur) => (cur === b.location ? null : b.location))
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
                        data.setSelectedGroup((cur) =>
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

  return (
    <>
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
            onClick={() => data.setShowNames((current) => !current)}
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
        {legend}
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
                onClick={() => data.setShowNames((current) => !current)}
              >
                {showNames ? "Hide names" : "Show names"}
              </button>
            </div>
            <div
              className="pointer-events-auto absolute inset-x-0 z-10 flex justify-center px-3"
              style={{ top: "calc(max(0.75rem, env(safe-area-inset-top)) + 3.5rem)" }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <LayerSwitch data={data} dark />
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
                <MapInfoCard
                  data={data}
                  showGroupPins={showGroupPins}
                  canManageStations={canManageStations}
                  onStationTap={onStationTap}
                  idle={
                    view.scale <= 1.05 ? (
                      <p className="inline-flex rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white">
                        Drag to move · Pinch to zoom
                      </p>
                    ) : (
                      <span />
                    )
                  }
                />
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
    </>
  );
}
