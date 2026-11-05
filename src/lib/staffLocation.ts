/**
 * HOF, OC and HOGM pins on the map (2D and 3D): one red for all three, so a staff member stands out from
 * the group pins, which are all blue (`GROUP_PIN_COLOR`). Brighter than the red of an In progress station.
 */
export const STAFF_PIN_COLOR = "#ef233c";

/** Height from a staff pin's tip to the centre of its round head, for head radius `r`. */
export const staffPinHeadY = (r: number) => 2.3 * r;

/**
 * A map pin (teardrop) as an SVG path, tip at (0, 0) on the person's location, head of radius `r` above it.
 * The 2D map and the "Staff on the Map" list draw it as SVG; the 3D map draws it with Path2D.
 */
export function staffPinPath(r: number): string {
  const cy = -staffPinHeadY(r);
  return `M 0 0 C ${-0.4 * r} ${-0.55 * r} ${-r} ${-1.15 * r} ${-r} ${cy} A ${r} ${r} 0 1 1 ${r} ${cy} C ${r} ${-1.15 * r} ${0.4 * r} ${-0.55 * r} 0 0 Z`;
}

export type StaffPosition = { user_id: string; full_name: string | null; role: "hof" | "oc" | "hogm"; lat: number; lng: number; accuracy_m: number | null; updated_at: string };
export function parseStaffPositions(value: unknown, nowMs = Date.now()): StaffPosition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row: unknown): StaffPosition[] => {
    if (!row || typeof row !== "object" || !("user_id" in row) || typeof row.user_id !== "string" ||
      !("full_name" in row) || (row.full_name !== null && typeof row.full_name !== "string") ||
      !("role" in row) || (row.role !== "hof" && row.role !== "oc" && row.role !== "hogm") ||
      !("lat" in row) || typeof row.lat !== "number" || !Number.isFinite(row.lat) || Math.abs(row.lat) > 90 ||
      !("lng" in row) || typeof row.lng !== "number" || !Number.isFinite(row.lng) || Math.abs(row.lng) > 180 ||
      !("accuracy_m" in row) || (row.accuracy_m !== null && (typeof row.accuracy_m !== "number" || !Number.isFinite(row.accuracy_m) || row.accuracy_m < 0 || row.accuracy_m > 1000)) ||
      !("updated_at" in row) || typeof row.updated_at !== "string" || !Number.isFinite(Date.parse(row.updated_at)) || nowMs - Date.parse(row.updated_at) >= 120_000) return [];
    return [{ user_id: row.user_id, full_name: row.full_name, role: row.role, lat: row.lat, lng: row.lng, accuracy_m: row.accuracy_m, updated_at: row.updated_at }];
  });
}
