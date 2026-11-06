// The time of day both campus maps draw. No 3D code here, so the 2D map can use it.

export type MapTime = "day" | "sunset" | "night";

/** Day from 7:00, sunset round dawn and dusk (6:00 and 18:00), night otherwise. */
export function mapTimeAt(date: Date): MapTime {
  const h = date.getHours();
  if (h >= 7 && h < 18) return "day";
  return h === 6 || h === 18 ? "sunset" : "night";
}
