// Turns a GPS position into a spot on the illustrated campus map.
//
// The art is stylised, not a true map: it is the campus turned about 135°
// (real north points down-right, real east down-left) and bent in places.
// We fit a thin-plate spline through the anchor points: a smooth warp that
// puts a pin exactly on an anchor when a Faci stands there and bends evenly
// in between (no pull toward the nearest anchor).
//
// To recalibrate, edit GPS_POINTS (buildings) or LANDMARKS (other places on
// the art). Each pairs a real GPS point with the same place on the image (x
// and y are percentages, as in mapBuildings). Points were read off Google
// Maps satellite view; more anchors in a gap make that area more precise.
// Use sharp points (a dome, a bridge, a statue), not the middle of a lake:
// the art draws lakes bigger than they are, and a fuzzy point folds the warp.

import { MAP_BUILDINGS } from "@/lib/mapBuildings";

type Area = (typeof MAP_BUILDINGS)[number]["area"];

const GPS_POINTS: Record<Area, { lat: number; lng: number }> = {
  A1: { lat: 2.830716513626805, lng: 101.70238566331372 },
  A2: { lat: 2.830894481771187, lng: 101.70300445323068 },
  A3: { lat: 2.831185702312712, lng: 101.70377875057042 },
  A4: { lat: 2.831229385384772, lng: 101.70461460291834 },
  A5: { lat: 2.8310562554223995, lng: 101.70528647466466 },
  "Track & Field": { lat: 2.8303729712091497, lng: 101.7068105515868 },
  B1: { lat: 2.8326752117750265, lng: 101.70648314368725 },
  "Tennis Court": { lat: 2.831869036722138, lng: 101.70667501669327 },
  "Volleyball Court": { lat: 2.831858794362992, lng: 101.7072533920544 },
};

/** Places on the art that are not buildings, to fill the gaps between them. */
const LANDMARKS: { name: string; lat: number; lng: number; x: number; y: number }[] = [
  // Red dome in the right-hand lake = LakeFront Café.
  { name: "LakeFront Café", lat: 2.833032, lng: 101.703063, x: 60.6, y: 29.8 },
  // Red bridge between the two lakes = middle of the causeway across the water.
  { name: "Lake causeway", lat: 2.833101, lng: 101.704567, x: 54.6, y: 39.5 },
  // Grey monument = Statue of Tan Kah Kee, at its base.
  { name: "Tan Kah Kee statue", lat: 2.8299, lng: 101.703976, x: 34.7, y: 15.5 },
];

export type GeoAnchor = { lat: number; lng: number; x: number; y: number };

/** Anchors built into the code. Admin anchors (map_anchors) are added on top. */
export const GEO_ANCHORS: GeoAnchor[] = [
  ...MAP_BUILDINGS.map((b) => ({ ...GPS_POINTS[b.area], x: b.x, y: b.y })),
  ...LANDMARKS.map(({ lat, lng, x, y }) => ({ lat, lng, x, y })),
];

/** Distance in metres between two GPS points (haversine). */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(bLat - aLat) / 2) ** 2 +
    Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** An Admin anchor this close to another anchor replaces it. */
export const ANCHOR_REPLACE_M = 15;

// Local origin keeps the numbers small. 1e5 units is about 1.1 km.
const LAT0 = 2.8315;
const LNG0 = 101.7045;
const toLocal = (lat: number, lng: number) => ({
  u: (lng - LNG0) * 1e5,
  v: (lat - LAT0) * 1e5,
});

type Affine = [number, number, number];

function solve3(a: number[][], b: number[]): Affine {
  const m = a.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let r = i + 1; r < 3; r++) {
      if (Math.abs(m[r][i]) > Math.abs(m[p][i])) p = r;
    }
    [m[i], m[p]] = [m[p], m[i]];
    for (let r = 0; r < 3; r++) {
      if (r === i) continue;
      const f = m[r][i] / m[i][i];
      for (let c = i; c <= 3; c++) m[r][c] -= f * m[i][c];
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

function fitAxis(pick: "x" | "y"): Affine {
  const a = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const b = [0, 0, 0];
  for (const anchor of GEO_ANCHORS) {
    const { u, v } = toLocal(anchor.lat, anchor.lng);
    const row = [u, v, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) a[i][j] += row[i] * row[j];
      b[i] += row[i] * anchor[pick];
    }
  }
  return solve3(a, b);
}

// Straight (affine) fit: only used for the size of the accuracy halo.
const FIT_X = fitAxis("x");
const FIT_Y = fitAxis("y");

// ── Thin-plate spline ───────────────────────────────────────────────
// x(u, v) = a0 + a1·u + a2·v + Σ wᵢ·U(|p − pᵢ|), with U(r) = r²·ln r, chosen
// so it passes through every anchor and bends as little as possible.

function solveN(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(m[r][i]) > Math.abs(m[p][i])) p = r;
    }
    [m[i], m[p]] = [m[p], m[i]];
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = m[r][i] / m[i][i];
      for (let c = i; c <= n; c++) m[r][c] -= f * m[i][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

const tpsU = (d2: number) => (d2 < 1e-12 ? 0 : 0.5 * d2 * Math.log(d2));

type Warp = {
  points: { u: number; v: number }[];
  cx: number[];
  cy: number[];
};

function buildWarp(anchors: GeoAnchor[]): Warp | null {
  const points = anchors.map((a) => toLocal(a.lat, a.lng));
  const fit = (pick: "x" | "y") => {
    const n = points.length;
    const size = n + 3;
    const a = Array.from({ length: size }, () => new Array<number>(size).fill(0));
    const b = new Array<number>(size).fill(0);
    for (let i = 0; i < n; i++) {
      const pi = points[i];
      for (let j = 0; j < n; j++) {
        const pj = points[j];
        a[i][j] = tpsU((pi.u - pj.u) ** 2 + (pi.v - pj.v) ** 2);
      }
      a[i][n] = a[n][i] = 1;
      a[i][n + 1] = a[n + 1][i] = pi.u;
      a[i][n + 2] = a[n + 2][i] = pi.v;
      b[i] = anchors[i][pick];
    }
    return solveN(a, b);
  };
  const cx = fit("x");
  const cy = fit("y");
  if (![...cx, ...cy].every(Number.isFinite)) return null;
  return { points, cx, cy };
}

const BUILT_IN_WARP = buildWarp(GEO_ANCHORS)!;
let warp: Warp = BUILT_IN_WARP;

/**
 * Add Admin anchors (from map_anchors) to the built-in ones and refit. An
 * Admin anchor within ANCHOR_REPLACE_M of a built-in one overrides it. If
 * the fit fails, the built-in anchors are used alone.
 */
export function setExtraAnchors(extra: GeoAnchor[]) {
  const valid = extra.filter(
    (a) =>
      Number.isFinite(a.lat) &&
      Number.isFinite(a.lng) &&
      Number.isFinite(a.x) &&
      Number.isFinite(a.y),
  );
  const kept = GEO_ANCHORS.filter(
    (b) => !valid.some((a) => distanceM(a.lat, a.lng, b.lat, b.lng) < ANCHOR_REPLACE_M),
  );
  warp = (valid.length && buildWarp([...kept, ...valid])) || BUILT_IN_WARP;
}

function tps(coef: number[], u: number, v: number) {
  const n = warp.points.length;
  let out = coef[n] + coef[n + 1] * u + coef[n + 2] * v;
  for (let i = 0; i < n; i++) {
    const p = warp.points[i];
    out += coef[i] * tpsU((u - p.u) ** 2 + (v - p.v) ** 2);
  }
  return out;
}

/** Margin, in percent of the image, before a position counts as off the map. */
const OFF_MAP_MARGIN = 3;

/**
 * Map position as percentages of the image, or null when the position is
 * clearly outside the campus picture or not a valid coordinate.
 */
export function gpsToMapPercent(
  lat: number,
  lng: number
): { x: number; y: number } | null {
  const raw = gpsToMapPercentRaw(lat, lng);
  if (!raw) return null;
  const { x, y } = raw;
  const lo = -OFF_MAP_MARGIN;
  const hi = 100 + OFF_MAP_MARGIN;
  if (x < lo || x > hi || y < lo || y > hi) return null;
  return {
    x: Math.min(100, Math.max(0, x)),
    y: Math.min(100, Math.max(0, y)),
  };
}

/** Image position in percent, not clamped to the picture. */
function gpsToMapPercentRaw(
  lat: number,
  lng: number
): { x: number; y: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const { u, v } = toLocal(lat, lng);
  const x = tps(warp.cx, u, v);
  const y = tps(warp.cy, u, v);
  return { x, y };
}

/**
 * How a group pin looks by age. A pin is never hidden: after GPS_FADED_MS it
 * turns grey and the group is listed as "not seen".
 */
export const GPS_FRESH_MS = 2 * 60 * 1000;
export const GPS_FADED_MS = 10 * 60 * 1000;

export type PinState = "fresh" | "faded" | "stale";

export function gpsPinState(reportedAt: string, nowMs: number): PinState {
  const age = nowMs - new Date(reportedAt).getTime();
  if (age <= GPS_FRESH_MS) return "fresh";
  if (age <= GPS_FADED_MS) return "faded";
  return "stale";
}

/** A fix worse than this is "imprecise": drawn with a halo, and the Faci is warned. */
export const PRECISE_ACCURACY_M = 100;
/** A fix worse than this is stored but never drawn. */
export const MAX_DRAW_ACCURACY_M = 1000;

const M_PER_DEG_LAT = 111_320;

/**
 * The accuracy circle around a fix, as it looks on the art. The art is
 * skewed, so a circle on the ground is an ellipse on the image. Returns the
 * image offsets (in percent) of points `meters` east and north of the fix,
 * from the straight fit; draw a unit circle through the matrix [east north].
 */
export function accuracyAxes(
  lat: number,
  meters: number
): { east: { x: number; y: number }; north: { x: number; y: number } } {
  const du = (meters / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180))) * 1e5;
  const dv = (meters / M_PER_DEG_LAT) * 1e5;
  return {
    east: { x: FIT_X[0] * du, y: FIT_Y[0] * du },
    north: { x: FIT_X[1] * dv, y: FIT_Y[1] * dv },
  };
}

const GROUP_COLORS = [
  "#dc2626",
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#65a30d",
];

export function groupPinColor(groupId: number) {
  return GROUP_COLORS[Math.abs(groupId) % GROUP_COLORS.length];
}
