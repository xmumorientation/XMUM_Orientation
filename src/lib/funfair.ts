import { PROJECTOR_CODE_NAMES, type MapLightbulb, type ProjectorLocation } from "@/lib/types";

// The Vortexa Funfair's zones (docs/map3d-funfair-design.md): which lightbulbs
// (keys) power each zone, and whether it is on. No 3D code here, so Admin
// pages and the 2D map can use it.
//
// The setup lives in funfair_zones (migration 0088): only Admin and HOGM read
// it, and everyone gets fn_funfair_state (on or off, no keys). Until 0088 is
// applied, the defaults below decide from the lit bulbs.

export type FunfairZone = "west" | "central" | "east";

export const FUNFAIR_ZONES: FunfairZone[] = ["west", "central", "east"];

export const FUNFAIR_ZONE_NAMES: Record<FunfairZone, string> = {
  west: "West / Neon Pier",
  central: "Central / Starlight Midway",
  east: "East / Big Top",
};

/** Each zone's power: 0 off, 1 on. */
export type FunfairPower = Record<FunfairZone, number>;

export const FUNFAIR_OFF: FunfairPower = { west: 0, central: 0, east: 0 };

/** The default key of each zone (also 0088's seed rows). */
export const DEFAULT_ZONE_KEYS: Record<FunfairZone, ProjectorLocation> = { east: "B1", west: "A3", central: "TF" };

/** For Admin's and HOGM's Funfair cards: the map's zone signs follow the default keys, not the keys set there. */
export const SIGN_NOTE =
  "The map's zone signs name each zone after its default key: Star (B1) for East, Wheel (A3) for West, Orbit (TF) for " +
  "Central. Change a zone's keys only in an emergency, or its sign and the key that lights it disagree.";

/**
 * What players call a zone: its key's code name and its area, "Star · Big Top". One projector per zone by design,
 * so the map's zone signs and Items' keys match. East, Central and West are for Admin and HOGM only.
 */
export function zoneTitle(zone: FunfairZone): string {
  return `${PROJECTOR_CODE_NAMES[DEFAULT_ZONE_KEYS[zone]]} / ${FUNFAIR_ZONE_NAMES[zone].split(" / ")[1]}`;
}

/** A row of funfair_zones. */
export type FunfairZoneRow = {
  zone: FunfairZone;
  name: string;
  required: ProjectorLocation[];
  rule: "any" | "all";
  manual: boolean | null;
  updated_at: string;
};

/** The zones on for the lit bulbs, with the default keys (before 0088). */
export function funfairFromBulbs(bulbs: Pick<MapLightbulb, "location" | "activated_at">[]): FunfairPower {
  const lit = new Set(bulbs.filter((b) => b.activated_at).map((b) => b.location));
  const on = (zone: FunfairZone) => (lit.has(DEFAULT_ZONE_KEYS[zone]) ? 1 : 0);
  return { west: on("west"), central: on("central"), east: on("east") };
}

/** fn_funfair_state's rows → power. */
export function funfairFromState(rows: { zone: string; powered: boolean }[]): FunfairPower {
  const power = { ...FUNFAIR_OFF };
  for (const r of rows) if (r.zone in power && r.powered) power[r.zone as FunfairZone] = 1;
  return power;
}

/** Whether a zone row is on, the way fn_funfair_state decides (for Admin's "on now"). */
export function zoneIsOn(row: FunfairZoneRow, lit: Set<ProjectorLocation>): boolean {
  if (row.manual !== null) return row.manual;
  if (row.required.length === 0) return false;
  return row.rule === "all" ? row.required.every((k) => lit.has(k)) : row.required.some((k) => lit.has(k));
}

/** `?funfair=1,0,1` (west, central, east), for dev pages; null when absent or malformed. */
export function parseFunfair(value: string | null): FunfairPower | null {
  const v = value?.split(",").map(Number);
  if (!v || v.length !== 3 || v.some((n) => n !== 0 && n !== 1)) return null;
  return { west: v[0], central: v[1], east: v[2] };
}

export const anyZoneOn = (p: FunfairPower) => p.west > 0 || p.central > 0 || p.east > 0;

/** All three zones on: the finale, when the lake stage plays its concert (docs/map3d-lakefront-design.md). */
export const allZonesOn = (p: FunfairPower) => p.west > 0 && p.central > 0 && p.east > 0;

/** What `?funfair_preview=` can show: a zone's power-up, or the lake stage's concert (the finale). */
export type FunfairPreview = FunfairZone | "lakefront";

export const isFunfairPreview = (v: string | null): v is FunfairPreview =>
  v === "lakefront" || FUNFAIR_ZONES.includes(v as FunfairZone);

/** True when the error says migration 0088 is not applied (no such table or function). */
export function funfairMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code ?? "")) return true;
  const m = error.message ?? "";
  return /could not find|does not exist/i.test(m) && /funfair/.test(m);
}
