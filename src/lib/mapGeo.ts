// Turns a GPS position into a spot on the illustrated campus map.
//
// The art is stylised, not a true map. So we fit a straight (affine) map
// from lat/lng to the image, then pull the result onto the real anchor
// points with inverse-distance weighting. The pin lands exactly on an anchor
// when a Faci stands at it, and stays smooth between anchors.
//
// To recalibrate, edit GEO_ANCHORS. Each anchor pairs a real GPS point with
// the same place on the image (x and y are percentages, as in mapBuildings).

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
};

// The courts (2.8318615, 101.7066679) are between B1 and Track & Field.
// They are not drawn on the art, so they are not an anchor.

export const GEO_ANCHORS = MAP_BUILDINGS.map((b) => ({
  ...GPS_POINTS[b.area],
  x: b.x,
  y: b.y,
}));

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

const FIT_X = fitAxis("x");
const FIT_Y = fitAxis("y");

function affine(fit: Affine, u: number, v: number) {
  return fit[0] * u + fit[1] * v + fit[2];
}

const RESIDUALS = GEO_ANCHORS.map((anchor) => {
  const { u, v } = toLocal(anchor.lat, anchor.lng);
  return {
    u,
    v,
    dx: anchor.x - affine(FIT_X, u, v),
    dy: anchor.y - affine(FIT_Y, u, v),
  };
});

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
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const { u, v } = toLocal(lat, lng);
  let x = affine(FIT_X, u, v);
  let y = affine(FIT_Y, u, v);

  let wSum = 0;
  let dx = 0;
  let dy = 0;
  for (const r of RESIDUALS) {
    const d2 = (u - r.u) ** 2 + (v - r.v) ** 2;
    if (d2 < 1e-6) {
      wSum = 1;
      dx = r.dx;
      dy = r.dy;
      break;
    }
    const w = 1 / d2;
    wSum += w;
    dx += w * r.dx;
    dy += w * r.dy;
  }
  if (wSum > 0) {
    x += dx / wSum;
    y += dy / wSum;
  }

  const lo = -OFF_MAP_MARGIN;
  const hi = 100 + OFF_MAP_MARGIN;
  if (x < lo || x > hi || y < lo || y > hi) return null;
  return {
    x: Math.min(100, Math.max(0, x)),
    y: Math.min(100, Math.max(0, y)),
  };
}

/** How a GPS report looks by age: fresh, faded, or hidden from the map. */
export const GPS_FRESH_MS = 3 * 60 * 1000;
export const GPS_HIDE_MS = 15 * 60 * 1000;

export function gpsPinState(
  reportedAt: string,
  nowMs: number
): "fresh" | "faded" | "hidden" {
  const age = nowMs - new Date(reportedAt).getTime();
  if (age <= GPS_FRESH_MS) return "fresh";
  if (age <= GPS_HIDE_MS) return "faded";
  return "hidden";
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
