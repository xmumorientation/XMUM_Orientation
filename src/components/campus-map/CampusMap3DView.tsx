"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Clock, Maximize2, Minus, Moon, Plus, RotateCcw, Sun, Sunset, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import type { MapControls as MapControlsImpl } from "three-stdlib";

import { MODES, type Mode } from "@/components/map3d/atmosphere";
import CampusScene, { type CameraView, type Vec3 } from "@/components/map3d/CampusScene";
import { EXTENT, UNITS_PER_M, gpsToWorld, groundHit, groundY } from "@/components/map3d/geo";
import {
  CameraRig,
  GroundMarks,
  HitArea,
  Marker,
  RideTags,
  ZoneSigns,
  clusterArt,
  isTap,
  pinArt,
  stationArt,
  tagArt,
  youArt,
  type Flight,
  type FlightPlan,
  type GroundCircle,
  type GroundOutline,
} from "@/components/map3d/markers";
import {
  AREA_PLACES,
  CONTENT_BOUNDS,
  areaPlace,
  clampToSlab,
  labelPoint,
} from "@/components/map3d/places";
import { ZONE_CENTERS } from "@/components/map3d/funfair/labels";
import { stageView } from "@/components/map3d/lakefront/layout";
import { TENNIS_AREA, useTennisOnMap, type TennisSettings } from "@/components/map3d/tennis/useTennisOnMap";
import { prefersLite } from "@/components/map3d/webgl";
import { stationDotColor } from "@/components/ui";
import { ACTIVATION_JOURNEY_KEY, readActivationJourney } from "@/lib/activation-journey";
import { type FunfairPower, type FunfairZone, isFunfairPreview, type FunfairPreview, zoneTitle } from "@/lib/funfair";
import { groupPinColor } from "@/lib/mapGeo";
import type { Station } from "@/lib/types";

import type { CampusMapViewProps } from "./CampusMap2DView";
import { MapInfoCard } from "./CampusMapPanels";
import { clusterStatus } from "./useCampusMapData";

function initialActivationArrival(): { zones: FunfairZone[]; on: boolean } | null {
  if (typeof window === "undefined" || new URLSearchParams(window.location.search).get("arrival") !== "activation") return null;
  let zones: FunfairZone[] = [];
  try { zones = readActivationJourney(sessionStorage.getItem(ACTIVATION_JOURNEY_KEY), Date.now()); } catch { /* Storage may be blocked. */ }
  return { zones, on: false };
}

// Signal an actual rendered frame, rather than starting the power-up while
// the 3D bundle, shaders or phone GPU are still loading.
function SceneReady({ onReady }: { onReady: () => void }) {
  const sent = useRef(false);
  useFrame(() => { if (!sent.current) { sent.current = true; onReady(); } });
  return null;
}

// The 3D view: the same data, taps and full-screen viewer as CampusMap2DView,
// drawn on the 3D campus (map3d/). Stations sit on their building, group pins
// at their true GPS spot (no warp). It has no Lightbulbs layer: the bulbs are
// listed under the map (CampusMapPanels), and the funfair will show them.
//
// One scene serves the card and the full-screen viewer: its element moves
// between the two, so the 3D context is made once. In the card the camera is
// still and the page scrolls over it; tapping it opens full screen, where
// the camera moves.

/** Fallback when the page sets no theme colour (Admin pages). */
const DEFAULT_ACCENT = "#0891b2";
/** Gap (CSS px) between a building's label and the marker above it. */
const LABEL_GAP = 13;
/** Dot and badge radii (CSS px) of an unselected station and building badge (markers.tsx). */
const DOT_R = 11;
const BADGE_R = 15;
/** Markers in the card are smaller than in full screen (the card shows the whole campus). */
const CARD_MARKER_SIZE = 0.8;

/** Furthest a fitted view starts (MapControls in CampusScene stop zooming out at 420). */
const MAX_FIT = 360;

/**
 * Look from the A-row side toward the Funfair, keeping the blocks spread across the screen. Fit the
 * buildings, courts and dorms, including their markers.
 */
function fitCamera(aspect: number): CameraView {
  const [x0, x1] = CONTENT_BOUNDS.x;
  const [z0, z1] = CONTENT_BOUNDS.z;
  const target = new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const back = new THREE.Vector3(-1, 0.95, 0).normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(back).normalize();
  const up = back.clone().cross(right);
  const tanV = Math.tan((15 * Math.PI) / 180) * 0.9;
  // A tall phone screen would need a very distant camera to fit the campus's width; frame it as if it were
  // 3:4 instead (the sides can be panned to) and stay well inside the controls' 420 limit.
  const tanH = tanV * Math.max(aspect, 0.75);
  let distance = 0;
  for (const x of [x0, x1])
    for (const z of [z0, z1])
      for (const y of [0, 16]) {
        const v = new THREE.Vector3(x, y, z).sub(target);
        const depth = v.dot(back);
        distance = Math.max(distance, depth + Math.abs(v.dot(right)) / tanH, depth + Math.abs(v.dot(up)) / tanV);
      }
  const position = back.multiplyScalar(Math.min(distance, MAX_FIT)).add(target);
  return { position: [position.x, position.y, position.z], target: [target.x, target.y, target.z] };
}

/** The look for the time of day: day from 7:00, sunset round dawn and dusk, night otherwise. */
function modeNow(): Mode {
  const h = new Date().getHours();
  if (h >= 7 && h < 18) return "day";
  return h === 6 || h === 18 ? "sunset" : "night";
}

/** Where a station's marker sits: a point, and how far above it (CSS px) the dot's centre is. */
type Spot = { at: Vec3; dy: number; r: number; key: string };

type Mark = { at: Vec3; dx: number; dy: number; order: number; opacity: number };
type StationMark = Mark & { station: Station; big: boolean };
type BadgeMark = Mark & { area: string; stations: Station[]; big: boolean };
type PinMark = Mark & { groupId: number; color: string; big: boolean; dashed: boolean; manual: boolean };
/** A name tag on the map during Admin's accuracy check: "You", another Admin, the tapped spot. */
type TagMark = { key: string; text: string; at: Vec3; dot?: boolean };

type Taps = {
  station: (s: Station) => void;
  badge: (area: string) => void;
  building: (area: string) => boolean;
  group: (id: number) => void;
  /** Accuracy check: the ground was tapped here (world x, z). */
  ground: (x: number, z: number) => void;
  /** Records that the scene used this click, so the card does not also open full screen. */
  used: (e: ThreeEvent<MouseEvent>) => void;
};

/** The light switch: a chosen look, or Auto (by the time of day). */
const LOOKS: { mode: Mode | null; label: string; Icon: typeof Sun }[] = [
  { mode: null, label: "Auto", Icon: Clock },
  { mode: "sunset", label: "Sunset", Icon: Sunset },
  { mode: "day", label: "Day", Icon: Sun },
  { mode: "night", label: "Night", Icon: Moon },
];

/** Accuracy check: the open ground takes taps, so Admin can tap where they really are. */
function GroundTap({ taps }: { taps: Taps }) {
  return (
    <mesh
      visible={false}
      rotation-x={-Math.PI / 2}
      position-y={0.15}
      onClick={(e) => {
        if (!isTap(e)) return;
        e.stopPropagation();
        taps.used(e);
        // the spot on the ground the ray meets, the A-row's raised ground included
        taps.ground(...groundHit(e.ray.origin, e.ray.direction));
      }}
    >
      <planeGeometry args={[EXTENT.x * 2, EXTENT.z * 2]} />
      <meshBasicMaterial />
    </mesh>
  );
}

/** Ground marks, tap areas and the camera: inside the scene. */
function SceneMarks({
  circles,
  outlines,
  lite,
  flight,
  checking,
  taps,
}: {
  circles: GroundCircle[];
  outlines: GroundOutline[];
  lite: boolean;
  flight: Flight | null;
  /** Admin's accuracy check: taps go to the ground, not the buildings. */
  checking: boolean;
  taps: Taps;
}) {
  return (
    <>
      <GroundMarks circles={circles} outlines={outlines} lite={lite} />
      {checking && <GroundTap taps={taps} />}
      {AREA_PLACES.map((p) => (
        <HitArea
          key={p.area}
          place={p}
          height={p.height}
          onTap={(e) => {
            if (checking) {
              // A tap on a roof or wall means "in this building": the spot under the hit, not the ground the ray
              // would reach behind it.
              taps.used(e);
              taps.ground(e.point.x, e.point.z);
            } else if (taps.building(p.area)) taps.used(e);
          }}
        />
      ))}
      <CameraRig flight={flight} />
    </>
  );
}

/** Markers drawn on top of the finished frame. */
function SceneMarkers({
  stations,
  badges,
  pins,
  tags,
  funfair,
  showNames,
  accent,
  size,
  taps,
}: {
  stations: StationMark[];
  badges: BadgeMark[];
  pins: PinMark[];
  tags: TagMark[];
  /** Which zones are on, for the zone signs. */
  funfair: FunfairPower;
  showNames: boolean;
  accent: string;
  size: number;
  taps: Taps;
}) {
  return (
    <>
      <RideTags />
      {showNames && <ZoneSigns power={funfair} size={size} />}
      {tags.map((t) => (
        <Marker key={`tag-${t.key}`} position={t.at} art={tagArt(t.text)} dy={t.dot ? 24 : 16} order={9} size={size} />
      ))}
      {tags
        .filter((t) => t.dot)
        .map((t) => (
          <Marker key={`dot-${t.key}`} position={t.at} art={youArt()} order={9} size={size} />
        ))}
      {badges.map((b) => {
        const status = clusterStatus(b.stations);
        return (
          <Marker
            key={`badge-${b.area}`}
            position={b.at}
            art={clusterArt(status, stationDotColor(status), b.stations.length, b.big, b.big ? accent : null)}
            dy={b.dy}
            order={b.order}
            size={size}
            onTap={(e) => {
              taps.used(e);
              taps.badge(b.area);
            }}
          />
        );
      })}
      {stations.map((m) => (
        <Marker
          key={`station-${m.station.id}`}
          position={m.at}
          art={stationArt(
            m.station.status,
            stationDotColor(m.station.status),
            m.big,
            m.big ? accent : null,
            showNames ? m.station.code : null,
          )}
          dy={m.dy}
          order={m.order}
          size={size}
          onTap={(e) => {
            taps.used(e);
            taps.station(m.station);
          }}
        />
      ))}
      {pins.map((m) => (
        <Marker
          key={`group-${m.groupId}`}
          position={m.at}
          art={pinArt(String(m.groupId), m.color, m.big, m.big ? accent : null, m.dashed, m.manual)}
          dx={m.dx}
          dy={m.dy}
          opacity={m.opacity}
          order={m.order}
          size={size}
          onTap={(e) => {
            taps.used(e);
            taps.group(m.groupId);
          }}
        />
      ))}
    </>
  );
}

export type CampusMap3DViewProps = CampusMapViewProps & {
  /** Scene look. Defaults by the time of day. */
  mode?: Mode;
  /** Lighter scene. Defaults to prefersLite() (phones and low-power devices). */
  lite?: boolean;
  /** Swoop in when the card first shows (default true). */
  intro?: boolean;
  /** Start view (and the view Reset goes back to). Defaults to the campus fitted to the card. */
  camera?: CameraView;
  /** The 3D map can't be used on this device (no renderer, or too slow): show the 2D map. */
  onFail?: () => void;
  /** The tennis game on the courts (docs/ROADMAP.md, item 9): Admin's switch and who plays here. None: no game. */
  tennis?: TennisSettings | null;
};

export function CampusMap3DView({
  data,
  showGroupPins,
  canManageStations,
  highlightStationId,
  onStationTap,
  fullscreen,
  onFullscreenChange,
  legend,
  tennis: tennisSettings,
  mode,
  lite,
  intro = true,
  camera,
  onFail,
}: CampusMap3DViewProps) {
  const {
    mapStations,
    stations,
    activeSelected,
    openBuilding,
    clusterArea,
    showNames,
    drawnPins,
    selectedGroup,
    checkMode,
    check,
    myId,
  } = data;
  const rootRef = useRef<HTMLDivElement>(null);
  const cardSlot = useRef<HTMLDivElement>(null);
  const fullSlot = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const controls = useRef<MapControlsImpl>(null);
  const usedAt = useRef(-1);
  const flights = useRef(0);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [env, setEnv] = useState<{ lite: boolean; mode: Mode; touch: boolean; camera: CameraView } | null>(null);
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [onAccent, setOnAccent] = useState("#ffffff");
  const [flight, setFlight] = useState<Flight | null>(null);
  // The light switch: null is Auto (by the time of day). It lasts until Auto is picked again or the page reloads.
  const [look, setLook] = useState<Mode | null>(null);
  // Accuracy check: where Admin last tapped (world x, z).
  const [checkTap, setCheckTap] = useState<[number, number] | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const markSceneReady = useCallback(() => setSceneReady(true), []);
  const [arrival, setArrival] = useState(initialActivationArrival);
  const arrivalStarted = useRef(false);
  const checking = checkMode && canManageStations;
  // The tennis game on the courts, while Admin has it open: a match takes the screen in a layer of its own, and
  // the scene's element moves there.
  const tennis = useTennisOnMap(tennisSettings, fullscreen);
  const matchSlot = useRef<HTMLDivElement>(null);
  const focusMatch = useCallback((el: HTMLDivElement | null) => el?.focus(), []);

  // The scene's own element, moved between the card and the full-screen viewer.
  useEffect(() => {
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;inset:0";
    setHost(el);
    const card = cardSlot.current;
    setEnv({
      lite: prefersLite(),
      mode: modeNow(),
      touch: window.matchMedia("(pointer: coarse)").matches,
      camera: fitCamera(card && card.clientHeight > 0 ? card.clientWidth / card.clientHeight : 4 / 3),
    });
    return () => el.remove();
  }, []);
  useLayoutEffect(() => {
    const slot = tennis.playing && matchSlot.current ? matchSlot.current : fullscreen ? fullSlot.current : cardSlot.current;
    if (host && slot && host.parentNode !== slot) slot.appendChild(host);
  }, [host, fullscreen, tennis.playing]);

  // The group's colour (Freshie, Faci), the Welcome cyan (HOF, HOGM, Committee) or the brand colour, for
  // selections. Read from the page (on mount and on each open or close of full screen), since the
  // full-screen viewer is a portal outside the themed element.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const css = getComputedStyle(el);
    const fh = css.getPropertyValue("--fh-accent").trim();
    setAccent(fh || css.getPropertyValue("--brand-1").trim() || DEFAULT_ACCENT);
    // Text on an accent fill: the group's own (a light group colour gets dark text), else white.
    setOnAccent((fh && css.getPropertyValue("--fh-on-blue").trim()) || "#ffffff");
  }, [env, fullscreen]);

  useEffect(() => {
    if (!checkMode) setCheckTap(null);
  }, [checkMode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("arrival") === "activation") {
      onFullscreenChange(true);
      return;
    }
    const zone = params.get("funfair_preview");
    if (!isFunfairPreview(zone)) return;
    setPreview({ zone, on: false });
    onFullscreenChange(true);
    const plan: FlightPlan =
      zone === "lakefront"
        ? { kind: "to", ...stageView(window.innerWidth < window.innerHeight) }
        : { kind: "focus", target: [ZONE_CENTERS[zone][0], 0, ZONE_CENTERS[zone][1]], distance: 70 };
    const toZone = window.setTimeout(() => fly(plan), 1200);
    const powerUp = window.setTimeout(() => setPreview({ zone, on: true }), 3200);
    return () => {
      window.clearTimeout(toZone);
      window.clearTimeout(powerUp);
    };
    // Once, on open (fly and onFullscreenChange only set state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLite = lite ?? env?.lite ?? true;
  // The light switch wins; Auto is the page's `mode`, else the time of day.
  const sceneMode = look ?? mode ?? env?.mode ?? "day";
  // The funfair's zones (data.funfair: funfair_zones, or the default keys), and Admin's preview
  // (?funfair_preview=west, from the Funfair card): full screen opens on that zone, which then powers up, on this
  // screen only. ?funfair_preview=lakefront opens on the lake stage and plays the concert's opening. Otherwise the
  // concert follows the funfair (CampusScene: all three zones on).
  const [preview, setPreview] = useState<{ zone: FunfairPreview; on: boolean } | null>(null);
  const funfair = useMemo(
    () =>
      preview && preview.zone !== "lakefront" ? { ...data.funfair, [preview.zone]: preview.on ? 1 : 0 }
        : arrival && !arrival.on ? Object.fromEntries(Object.entries(data.funfair).map(([zone, power]) => [zone, arrival.zones.includes(zone as FunfairZone) ? 0 : power])) as FunfairPower
        : data.funfair,
    [data.funfair, preview, arrival],
  );
  const concert = preview?.zone === "lakefront" ? preview.on : undefined;

  function fly(plan: FlightPlan) {
    setFlight({ ...plan, id: ++flights.current });
  }

  // A match gone from the screen (its end card closed, or the game closed): the camera backs out over the courts,
  // from the players' height to the map's.
  const wasPlaying = useRef(false);
  useEffect(() => {
    const court = areaPlace(TENNIS_AREA);
    if (wasPlaying.current && !tennis.playing && fullscreen && court) fly({ kind: "focus", target: [court.pos[0], 0, court.pos[1]], distance: 35 });
    wasPlaying.current = tennis.playing;
    // Only when a match goes (fly only sets state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tennis.playing]);

  // Full screen has another shape than the card: frame the campus for it (or the given start view). Only when
  // full screen opens: the light switch also updates `env` (Auto rereads the clock) and must not move the camera.
  const envReady = env !== null;
  const fullView = useMemo(
    () => (fullscreen && envReady ? (camera ?? fitCamera(window.innerWidth / window.innerHeight)) : null),
    [fullscreen, envReady, camera],
  );
  useEffect(() => {
    if (fullView && !arrival) setFlight({ kind: "to", ...fullView, id: ++flights.current });
  }, [fullView, arrival]);

  useEffect(() => {
    if (!arrival || arrivalStarted.current || !sceneReady || !envReady || !fullscreen || !data.funfairReady) return;
    // Wait until the shared read sees the activation too. A stale first read
    // must not cause the power-up to play invisibly or invent a lit zone.
    if (arrival.zones.some(zone => !data.funfair[zone])) return;
    const zone = arrival.zones[0] ?? "central";
    const move = window.setTimeout(() => {
      const [x, z] = ZONE_CENTERS[zone];
      fly({ kind: "focus", target: [x, 0, z], distance: arrival.zones.length > 1 ? 150 : window.innerWidth < window.innerHeight ? 115 : 70 });
    }, 100);
    const power = window.setTimeout(() => {
      arrivalStarted.current = true;
      setArrival(current => current && { ...current, on: true });
      try { sessionStorage.removeItem(ACTIVATION_JOURNEY_KEY); } catch { /* Optional storage. */ }
      const url = new URL(window.location.href);
      url.searchParams.delete("arrival");
      window.history.replaceState(window.history.state, "", url);
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 150 : 1400);
    return () => { window.clearTimeout(move); window.clearTimeout(power); };
    // Setters and fly are stable; wait for rendering, fullscreen layout and shared state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneReady, envReady, fullscreen, data.funfairReady, data.funfair, arrival]);

  useEffect(() => {
    if (!arrival || arrival.on || !sceneReady) return;
    // If connectivity drops or a committee member reverses the activation,
    // reveal the real state rather than leaving a zone hidden indefinitely.
    const timeout = window.setTimeout(() => {
      arrivalStarted.current = true;
      setArrival({ zones: [], on: true });
      try { sessionStorage.removeItem(ACTIVATION_JOURNEY_KEY); } catch { /* Optional storage. */ }
    }, 15000);
    return () => window.clearTimeout(timeout);
  }, [arrival, sceneReady]);

  function openFullscreen() {
    onFullscreenChange(true);
  }

  function closeFullscreen() {
    onFullscreenChange(false);
    setFlight(null);
    if (arrival) {
      setArrival(null);
      arrivalStarted.current = true;
      try { sessionStorage.removeItem(ACTIVATION_JOURNEY_KEY); } catch { /* Optional storage. */ }
      const url = new URL(window.location.href);
      url.searchParams.delete("arrival");
      window.history.replaceState(window.history.state, "", url);
    }
    controls.current?.reset();
  }

  function toggleBuilding(area: string) {
    data.setOpenBuilding((current) => (current === area ? null : area));
    // The building panel sits on the page, under this overlay.
    if (fullscreen) closeFullscreen();
  }

  // The current game day’s stations by area, for the areas the 3D map places (TBD has no place yet).
  const byArea = useMemo(() => {
    const map = new Map<string, Station[]>();
    for (const s of mapStations) {
      if (!areaPlace(s.area)) continue;
      map.set(s.area, [...(map.get(s.area) ?? []), s]);
    }
    return map;
  }, [mapStations]);

  // Each station's marker spot: alone, or in a building's badge, it floats over the building's label. A building
  // with several stations always shows one badge (its station count), never separate dots.
  const spots = useMemo(() => {
    const map = new Map<number, Spot>();
    for (const [area, list] of byArea) {
      const place = areaPlace(area)!;
      const together = list.length >= 2;
      const r = together ? BADGE_R : DOT_R;
      for (const s of list) map.set(s.id, { at: labelPoint(place), dy: LABEL_GAP + r, r, key: `a${area}` });
    }
    return map;
  }, [byArea]);

  const isSelected = (s: Station) => s.id === activeSelected?.id || s.id === highlightStationId;

  // During Admin's accuracy check the map shows only the check: stations and groups step aside.
  const stationMarks: StationMark[] = [];
  const badgeMarks: BadgeMark[] = [];
  if (!checking) {
    for (const [area, list] of byArea) {
      if (list.length >= 2) {
        const big = clusterArea === area || openBuilding === area || list.some(isSelected);
        const spot = spots.get(list[0].id)!;
        badgeMarks.push({ area, stations: list, at: spot.at, dx: 0, dy: spot.dy, order: big ? 5 : 0, opacity: 1, big });
        continue;
      }
      for (const s of list) {
        const spot = spots.get(s.id)!;
        const big = isSelected(s);
        stationMarks.push({ station: s, at: spot.at, dx: 0, dy: spot.dy, order: big ? 5 : 0, opacity: 1, big });
      }
    }
  }

  // Accuracy check: "You" at this phone's GPS fix (with its accuracy circle), the other Admins checking, and
  // the spot last tapped.
  const tags: TagMark[] = [];
  const circles: GroundCircle[] = [];
  if (checking) {
    for (const o of check.others) {
      if (check.live && o.user_id === myId) continue;
      const [x, z] = clampToSlab(gpsToWorld(o.lat, o.lng));
      tags.push({ key: `admin-${o.user_id}`, text: o.full_name ?? "Admin", at: [x, 0.4 + groundY(x, z), z] });
      circles.push({ x, z, r: 0.5, color: "#334155", dashed: false });
    }
    if (check.live) {
      const [x, z] = clampToSlab(gpsToWorld(check.live.lat, check.live.lng));
      tags.push({ key: "you", text: "You", at: [x, 0.4 + groundY(x, z), z], dot: true });
      circles.push({ x, z, r: Math.max(0.5, check.live.acc * UNITS_PER_M), color: "#0284c7", dashed: false });
    }
    if (checkTap) {
      const [x, z] = checkTap;
      tags.push({ key: "tap", text: "Tapped", at: [x, 0.4 + groundY(x, z), z] });
      circles.push({ x, z, r: 0.6, color: accent, dashed: false });
    }
  }

  // Group pins: a GPS fix stands at its true spot, a check-in beside its station's marker. Several at one spot
  // stand side by side. Rough fixes, and the selected group's fix, show their accuracy circle on the ground.
  const pinMarks: PinMark[] = [];
  if (showGroupPins && !checking) {
    const beside = new Map<string, number>();
    const atSpot = new Map<string, PinMark[]>();
    for (const { g, pin } of drawnPins) {
      const color = pin.state === "stale" ? "#9ca3af" : groupPinColor(g.group_id);
      const big = selectedGroup === g.group_id;
      const base = {
        groupId: g.group_id,
        color,
        big,
        manual: pin.source === "manual",
        dashed: pin.source === "gps" && pin.imprecise && pin.accuracyM != null,
        order: big ? 8 : 3,
        opacity: pin.state === "faded" ? 0.6 : 1,
      };
      if (pin.source === "gps" && g.gps_lat != null && g.gps_lng != null) {
        const [x, z] = clampToSlab(gpsToWorld(g.gps_lat, g.gps_lng));
        const mark = { ...base, at: [x, groundY(x, z), z] as Vec3, dx: 0, dy: 0 };
        const key = `${Math.round(x)}:${Math.round(z)}`;
        atSpot.set(key, [...(atSpot.get(key) ?? []), mark]);
        pinMarks.push(mark);
        if (pin.accuracyM != null && (pin.imprecise || big)) {
          circles.push({ x, z, r: pin.accuracyM * UNITS_PER_M, color, dashed: pin.imprecise });
        }
        continue;
      }
      const station = stations.find((s) => s.id === g.checkin_station_id);
      const place = station ? areaPlace(station.area) : null;
      const spot =
        (station && spots.get(station.id)) ??
        (place ? { at: labelPoint(place), dy: LABEL_GAP + DOT_R, r: DOT_R, key: `a${place.area}` } : null);
      if (!spot) continue;
      const k = beside.get(spot.key) ?? 0;
      beside.set(spot.key, k + 1);
      pinMarks.push({ ...base, at: spot.at, dx: spot.r + 14 + k * 26, dy: spot.dy - spot.r });
    }
    for (const list of atSpot.values()) {
      list.forEach((mark, k) => (mark.dx = (k - (list.length - 1) / 2) * 26));
    }
  }

  if (!checking) for (const person of data.staffPositions) {
    const [x, z] = gpsToWorld(person.lat, person.lng);
    // Do not clamp an off-campus fix to the edge and misrepresent its location.
    if (Math.abs(x) <= EXTENT.x && Math.abs(z) <= EXTENT.z) {
      tags.push({ key: `staff-${person.user_id}`, text: `${person.role.toUpperCase()} / ${person.full_name || "Staff"}`, at: [x, 0, z], dot: true });
    }
  }

  const outlines: GroundOutline[] = [openBuilding, clusterArea].flatMap((area) => {
    const place = area && !checking ? areaPlace(area) : null;
    return place ? [{ place, color: accent }] : [];
  });

  const taps: Taps = {
    used: (e) => (usedAt.current = e.nativeEvent.timeStamp),
    station: (s) => {
      data.setSelected((current) => (current?.id === s.id ? null : s));
      onStationTap?.(s);
    },
    badge: (area) => {
      data.setSelected(null);
      if (canManageStations) {
        toggleBuilding(area);
        return;
      }
      data.setClusterArea((current) => (!fullscreen && current === area ? null : area));
      if (fullscreen) closeFullscreen();
    },
    // A building or court itself: the same as its marker, or Admin's building panel. False when the tap does
    // nothing here (the card then opens full screen, as a tap on the 2D map's picture does). While the tennis game
    // is open, the tennis court opens its card (Play), in full screen.
    building: (area) => {
      if (area === TENNIS_AREA && tennis.loaded) {
        tennis.showCard();
        if (!fullscreen) openFullscreen();
        return true;
      }
      if (canManageStations) {
        toggleBuilding(area);
        return true;
      }
      const list = byArea.get(area) ?? [];
      if (list.length === 1) taps.station(list[0]);
      else if (list.length >= 2) taps.badge(area);
      return list.length >= 1;
    },
    group: (id) => data.setSelectedGroup((current) => (current === id ? null : id)),
    // The averaged GPS fix's offset from the tapped spot, in metres (true scale: no warp to undo; +X is north,
    // +Z east).
    ground: (x, z) => {
      setCheckTap([x, z]);
      data.measureCheck((lat, lng) => {
        const [gx, gz] = gpsToWorld(lat, lng);
        return { east: (gz - z) / UNITS_PER_M, north: (gx - x) / UNITS_PER_M };
      });
    },
  };

  useEffect(() => {
    if (!fullscreen) return;
    closeButtonRef.current?.focus();
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;
    const scrollY = window.scrollY;
    const { style } = document.body;
    const previous = { position: style.position, top: style.top, width: style.width, overflow: style.overflow };
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

  const sky = MODES[sceneMode].skyTop;
  const namesButton = (className: string) => (
    <button
      type="button"
      className={className}
      aria-pressed={showNames}
      onClick={() => data.setShowNames((current) => !current)}
    >
      {showNames ? "Hide names" : "Show names"}
    </button>
  );

  return (
    <div ref={rootRef}>
      <div className="card overflow-hidden p-0" aria-hidden={fullscreen}>
        <div
          className="relative cursor-pointer select-none"
          onClick={(e) => {
            // Clicks in the scene arrive here too (it is this element's child in React, wherever it is shown).
            if (fullscreen) return;
            // Buttons, and the map data credit's link.
            if ((e.target as Element).closest("button, a, [data-map-hit]")) return;
            if (e.nativeEvent.timeStamp === usedAt.current) return;
            openFullscreen();
          }}
        >
          <div ref={cardSlot} className="relative h-[clamp(260px,80vw,520px)] w-full" style={{ background: sky }} />
          {namesButton(
            "absolute right-2 top-2 z-30 inline-flex h-11 items-center rounded-full bg-white/95 px-3 text-xs font-bold text-stone-900 shadow-sm ring-1 ring-black/15",
          )}
          <button
            type="button"
            className="absolute bottom-2 left-2 z-30 inline-flex h-10 items-center gap-1.5 rounded-full bg-black/75 px-3 text-xs font-semibold text-white"
            onClick={openFullscreen}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Full screen
          </button>
          {host &&
            env &&
            createPortal(
              <CampusScene
                mode={sceneMode}
                funfair={funfair}
                concert={concert}
                tennisLive={tennis.live && !tennis.playing}
                lite={isLite}
                camera={camera ?? env.camera}
                intro={arrival ? false : intro}
                // a match is the broadcast view alone: no place names or markers over it
                labels={showNames && !tennis.playing}
                controlsRef={controls}
                interactive={fullscreen}
                onFail={onFail}
                overlay={
                  !tennis.playing && (
                    <SceneMarkers
                      stations={stationMarks}
                      badges={badgeMarks}
                      pins={pinMarks}
                      tags={tags}
                      funfair={funfair}
                      showNames={showNames}
                      accent={accent}
                      size={fullscreen ? 1 : CARD_MARKER_SIZE}
                      taps={taps}
                    />
                  )
                }
              >
                <SceneReady onReady={markSceneReady} />
                <SceneMarks
                  circles={circles}
                  outlines={outlines}
                  lite={isLite}
                  flight={flight}
                  checking={checking}
                  taps={taps}
                />
                {tennis.loaded && <tennis.loaded.mod.TennisScene courts={tennis.loaded.courts} fullscreen={fullscreen} />}
              </CampusScene>,
              host,
            )}
        </div>
        {legend}
      </div>

      {fullscreen &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Campus map"
            className="fixed left-0 top-0 z-[80] h-dvh w-full touch-none select-none overflow-hidden overscroll-none"
            style={{ background: sky, touchAction: "none" }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div ref={fullSlot} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
            {arrival && <div role="status" className="pointer-events-none absolute inset-x-4 bottom-24 z-30 mx-auto max-w-sm rounded-2xl bg-black/80 px-5 py-3 text-center text-sm text-white">
              {!arrival.on ? "Your magic is reaching the funfair…" : arrival.zones.length ? `${arrival.zones.map(zoneTitle).join(" & ")} — lit up!` : "Your projector is lit. Explore the funfair!"}
            </div>}

            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 px-3"
              style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
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
              {namesButton(
                "pointer-events-auto inline-flex h-12 items-center rounded-full bg-white px-4 text-sm font-bold text-stone-900 shadow-lg",
              )}
            </div>
            <div
              role="radiogroup"
              aria-label="Map light"
              className="pointer-events-auto absolute right-3 z-30 flex gap-0.5 rounded-full bg-white p-1 shadow-lg"
              style={{ top: "calc(max(0.75rem, env(safe-area-inset-top)) + 3.75rem)" }}
            >
              {LOOKS.map(({ mode: m, label, Icon }) => {
                const on = look === m;
                return (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={label}
                    title={label}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-stone-700"
                    style={on ? { background: accent, color: onAccent } : undefined}
                    onClick={() => {
                      setLook(m);
                      // Auto reads the clock again (the map may have been open since before sunset).
                      if (m === null) setEnv((current) => current && { ...current, mode: modeNow() });
                    }}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                );
              })}
            </div>

            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between gap-3 px-3"
              style={{
                // Clear of the map data credit in the bottom right corner.
                paddingBottom:
                  onStationTap && activeSelected
                    ? "calc(8.5rem + env(safe-area-inset-bottom))"
                    : "max(1.75rem, calc(env(safe-area-inset-bottom) + 1.25rem))",
              }}
            >
              <div className="min-w-0 flex-1 space-y-2">
                {tennis.closed ? (
                  <div
                    role="status"
                    className="pointer-events-auto flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2.5 text-sm text-stone-900 shadow-lg"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold">Tennis is closed</div>
                      <div className="text-xs text-ink-faint">The courts are closed for now, so the game has ended.</div>
                    </div>
                    <button
                      type="button"
                      aria-label="Close"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                      onClick={tennis.dismissClosed}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  tennis.card &&
                  tennis.loaded && (
                    <tennis.loaded.mod.TennisCard
                      courts={tennis.loaded.courts}
                      onPlay={tennis.play}
                      onClose={tennis.hideCard}
                      // Admin's building panel for the court: what a tap on it opens while the game is closed
                      onStations={
                        canManageStations
                          ? () => {
                              tennis.hideCard();
                              toggleBuilding(TENNIS_AREA);
                            }
                          : undefined
                      }
                      accent={accent}
                      onAccent={onAccent}
                    />
                  )
                )}
                <MapInfoCard
                  data={data}
                  showGroupPins={showGroupPins}
                  canManageStations={canManageStations}
                  onStationTap={onStationTap}
                  idle={
                    <p className="inline-flex rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white">
                      {env?.touch ? "Drag to move / Two fingers to zoom and turn" : "Drag to move / Right-drag to turn / Scroll to zoom"}
                    </p>
                  }
                />
              </div>
              <div className="pointer-events-auto flex shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-lg">
                <button
                  type="button"
                  aria-label="Zoom in"
                  className="flex h-12 w-12 items-center justify-center text-stone-900"
                  onClick={() => fly({ kind: "zoom", factor: 1 / 1.6 })}
                >
                  <Plus className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label="Zoom out"
                  className="flex h-12 w-12 items-center justify-center border-t border-black/10 text-stone-900"
                  onClick={() => fly({ kind: "zoom", factor: 1.6 })}
                >
                  <Minus className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label="Reset view"
                  className="flex h-12 w-12 items-center justify-center border-t border-black/10 text-stone-900"
                  onClick={() => fullView && fly({ kind: "to", ...fullView })}
                >
                  <RotateCcw className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* This phone's tennis match: over the full-screen map, with the scene moved into it (and focused, so Space swings). */}
      {tennis.playing &&
        tennis.loaded &&
        createPortal(
          <div
            ref={focusMatch}
            role="dialog"
            aria-modal="true"
            aria-label="Tennis match"
            tabIndex={-1}
            className="fixed left-0 top-0 z-[85] h-dvh w-full touch-none select-none overflow-hidden overscroll-none outline-none"
            style={{ background: sky, touchAction: "none" }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div ref={matchSlot} className="absolute inset-0" />
            <tennis.loaded.mod.TennisMatchHud courts={tennis.loaded.courts} />
          </div>,
          document.body,
        )}
    </div>
  );
}
