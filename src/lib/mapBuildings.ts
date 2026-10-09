// Anchors on the illustrated campus map, as percentages of the image.
// A1 is the far end of the red-roof row. A5 is the end nearest the lake.

export const MAP_BUILDINGS = [
  { area: "A1", x: 50.48, y: 12.98 },
  { area: "A2", x: 46.73, y: 17.05 },
  { area: "A3", x: 42.98, y: 21.12 },
  { area: "A4", x: 39.06, y: 25.17 },
  { area: "A5", x: 35.32, y: 29.23 },
  { area: "Track & Field", x: 23.39, y: 46.2 },
  { area: "B1", x: 36.26, y: 58.2 },
] as const;

/** Day 2 projector marks, in the same percentages. Keyed by projector location. */
export const PROJECTOR_SPOTS: Record<string, { x: number; y: number }> = {
  A3: { x: 44.59, y: 19.2 },
  B1: { x: 39.79, y: 56.51 },
  TF: { x: 26.5, y: 48.81 },
};

export type MapBuilding = (typeof MAP_BUILDINGS)[number]["area"];

export function isMapBuilding(area: string): area is MapBuilding {
  return MAP_BUILDINGS.some((building) => building.area === area);
}

/** Short code prefix. Track & Field is TF so the map dot stays small. */
export function stationCodePrefix(area: string) {
  return area === "Track & Field" ? "TF" : area;
}

/** Next code for a building, for example A1-1, A1-2, TF-1. Skips numbers already used. */
export function nextStationCode(area: string, existingCodes: string[]) {
  const prefix = stationCodePrefix(area);
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  let max = 0;
  for (const code of existingCodes) {
    const match = code.match(pattern);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${max + 1}`;
}

/** The number at the end of a generated code, for example 1 from TF-1. */
export function stationNumberFromCode(code: string) {
  const match = code.match(/-(\d+)$/);
  return match ? Number(match[1]) : 1;
}

/** Place the nth station (0-based) around its building, clear of the label. */
export function stationPosition(
  area: string,
  index: number
): { x: number; y: number } | null {
  const building = MAP_BUILDINGS.find((item) => item.area === area);
  if (!building) return null;
  const slot = ((index % 8) + 8) % 8;
  const ring = Math.floor(index / 8);
  const angle = ((90 + slot * 45) * Math.PI) / 180;
  const radius = 3.1 + ring * 1.7;
  const x = clamp(building.x + Math.cos(angle) * radius, 3, 97);
  const y = clamp(building.y + Math.sin(angle) * radius * 0.7, 3, 97);
  return { x: round2(x), y: round2(y) };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
