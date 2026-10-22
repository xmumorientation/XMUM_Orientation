export type StaffPosition = { user_id: string; full_name: string | null; role: "hof" | "hogm"; lat: number; lng: number; accuracy_m: number | null; updated_at: string };
export function parseStaffPositions(value: unknown, nowMs = Date.now()): StaffPosition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row: unknown): StaffPosition[] => {
    if (!row || typeof row !== "object" || !("user_id" in row) || typeof row.user_id !== "string" ||
      !("full_name" in row) || (row.full_name !== null && typeof row.full_name !== "string") ||
      !("role" in row) || (row.role !== "hof" && row.role !== "hogm") ||
      !("lat" in row) || typeof row.lat !== "number" || !Number.isFinite(row.lat) || Math.abs(row.lat) > 90 ||
      !("lng" in row) || typeof row.lng !== "number" || !Number.isFinite(row.lng) || Math.abs(row.lng) > 180 ||
      !("accuracy_m" in row) || (row.accuracy_m !== null && (typeof row.accuracy_m !== "number" || !Number.isFinite(row.accuracy_m) || row.accuracy_m < 0 || row.accuracy_m > 1000)) ||
      !("updated_at" in row) || typeof row.updated_at !== "string" || !Number.isFinite(Date.parse(row.updated_at)) || nowMs - Date.parse(row.updated_at) >= 120_000) return [];
    return [{ user_id: row.user_id, full_name: row.full_name, role: row.role, lat: row.lat, lng: row.lng, accuracy_m: row.accuracy_m, updated_at: row.updated_at }];
  });
}
