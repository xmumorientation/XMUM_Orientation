// Live control's Day filter, remembered so Admin → Stations opens on the same day.
export type AdminDayFilter = "all" | "Day 1" | "Day 2";

const KEY = "admin-day-filter";

export function readAdminDayFilter(): AdminDayFilter | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "all" || v === "Day 1" || v === "Day 2" ? v : null;
  } catch {
    return null;
  }
}

export function saveAdminDayFilter(v: AdminDayFilter) {
  try {
    window.localStorage.setItem(KEY, v);
  } catch {
    /* storage unavailable: the filter just isn't remembered */
  }
}
