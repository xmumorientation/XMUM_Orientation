import { MAP_BUILDINGS } from "@/lib/mapBuildings";

// Facilitators' manual location updates (migration 0073). Text only: a status
// and a building. Not linked to GPS, the map or station check-in.

export type LocStatus = "heading_to" | "arrived" | "other";

export const LOC_STATUSES: { value: LocStatus; label: string }[] = [
  { value: "heading_to", label: "Heading to" },
  { value: "arrived", label: "Arrived" },
  { value: "other", label: "Other" },
];

/** The buildings a Facilitator can pick (the same list as the campus map). */
export const LOC_BUILDINGS: string[] = MAP_BUILDINGS.map((b) => b.area);

export const OTHER_TEXT_MAX = 60;
export const DETAILS_MAX = 200;

export type FaciLocation = {
  id: number;
  /** The Facilitator who sent it. */
  user_id: string;
  /** The group it belongs to: any Facilitator in the group can update it. */
  group_id: number;
  status: LocStatus;
  other_text: string | null;
  building: string;
  /** Optional comment. */
  details: string | null;
  created_at: string;
  edited_by: string | null;
  edited_at: string | null;
};

/** "Heading to A3", "Arrived at A3", "Taking photos · Track & Field". */
export function describeLocation(l: Pick<FaciLocation, "status" | "other_text" | "building">): string {
  if (l.status === "heading_to") return `Heading to ${l.building}`;
  if (l.status === "arrived") return `Arrived at ${l.building}`;
  return `${l.other_text ?? "Other"} · ${l.building}`;
}

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
