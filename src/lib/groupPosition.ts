// Decides where a group's single pin goes on the campus map.
//
// fn_group_positions() gives each group its best GPS fix (across all of its
// Facis' phones) and its current station check-in. The pin uses whichever is
// newer, except that a check-in from the last 10 minutes beats a GPS fix
// that is too rough to trust.

import type { GroupPosition } from "@/lib/types";
import {
  buildingAt,
  MAX_DRAW_ACCURACY_M,
  PRECISE_ACCURACY_M,
  gpsPinState,
  gpsToMapPercent,
  type PinState,
} from "@/lib/mapGeo";

const CHECKIN_TRUST_MS = 10 * 60 * 1000;

export interface GroupPin {
  source: "gps" | "manual";
  pos: { x: number; y: number };
  at: string;
  state: PinState;
  /** GPS accuracy in metres; null for a check-in. */
  accuracyM: number | null;
  /** True when the GPS fix is worse than PRECISE_ACCURACY_M. */
  imprecise: boolean;
  /** The building or court the group was last seen at, when known ("A4"). */
  area: string | null;
}

function ms(iso: string | null) {
  return iso ? new Date(iso).getTime() : NaN;
}

export function resolveGroupPin(
  g: GroupPosition,
  stationSpot: (stationId: number) => { x: number; y: number } | null,
  stationArea: (stationId: number) => string | null,
  nowMs: number
): GroupPin | null {
  const accuracy = g.gps_accuracy_m;
  const gpsPos =
    g.gps_lat != null &&
    g.gps_lng != null &&
    g.gps_at &&
    (accuracy == null || accuracy <= MAX_DRAW_ACCURACY_M)
      ? gpsToMapPercent(g.gps_lat, g.gps_lng)
      : null;
  const checkinPos =
    g.checkin_station_id != null && g.checkin_at
      ? stationSpot(g.checkin_station_id)
      : null;

  const gpsPin: GroupPin | null = gpsPos
    ? {
        source: "gps",
        pos: gpsPos,
        at: g.gps_at!,
        state: gpsPinState(g.gps_at!, nowMs),
        accuracyM: accuracy,
        imprecise: accuracy == null || accuracy > PRECISE_ACCURACY_M,
        area: g.gps_lat != null && g.gps_lng != null ? buildingAt(g.gps_lat, g.gps_lng) : null,
      }
    : null;
  const checkinPin: GroupPin | null = checkinPos
    ? {
        source: "manual",
        pos: checkinPos,
        at: g.checkin_at!,
        state: gpsPinState(g.checkin_at!, nowMs),
        accuracyM: null,
        imprecise: false,
        area: stationArea(g.checkin_station_id!),
      }
    : null;

  if (!gpsPin) return checkinPin;
  if (!checkinPin) return gpsPin;

  const checkinNewer = ms(g.checkin_at) >= ms(g.gps_at);
  const checkinRecent = nowMs - ms(g.checkin_at) <= CHECKIN_TRUST_MS;
  return checkinNewer || (checkinRecent && gpsPin.imprecise)
    ? checkinPin
    : gpsPin;
}
