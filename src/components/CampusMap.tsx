"use client";

import { useEffect, useMemo, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase/client";
import { stationDotColor } from "@/components/ui";
import type {
  LatestLocation,
  Projector,
  Station,
  StationOccupancy,
} from "@/lib/types";
import { isStale, timeAgo } from "@/lib/utils";

// Returns an occupancy-aware fill colour for a station dot.
export function getStationDotFill(
  status: Station["status"],
  occ: number,
  isPkDay1: boolean = false
): string {
  if (status === "closed") return "#9ca3af";
  if (status === "in_progress") return "#dc2626";
  const capacity = isPkDay1 ? 2 : 1;
  if (capacity === 2) {
    if (occ >= 2) return "#dc2626"; // Full
    if (occ === 1) return "#d97706"; // Amber – 1/2 waiting for opponent
    return "#16a34a"; // Green – 0/2 available
  }
  // capacity === 1
  if (occ >= 1) return "#dc2626"; // Occupied
  return "#16a34a"; // Green – 0/1 available
}

export interface CampusMapProps {
  showGroupPins?: boolean;
  onStationTap?: (station: Station) => void;
  highlightStationId?: number | null;
  /** Occupancy counts from fn_public_station_occupancy — drives dot colour. */
  occupancy?: StationOccupancy[];
  stations?: Station[];
  locations?: LatestLocation[];
  projectors?: Projector[];
  day2Layer?: boolean;
  hideDetailsCard?: boolean;
  className?: string;
}

// FR-4.1: custom SVG campus map (no Google Maps dependency).
// FR-4.4: station status changes propagate via Realtime.
// FR-4.3: Day 2 projector layer appears only when Admin toggles it.
export function CampusMap({
  showGroupPins = false,
  onStationTap,
  highlightStationId,
  occupancy: propOccupancy,
  stations: propStations,
  locations: propLocations,
  projectors: propProjectors,
  day2Layer: propDay2Layer,
  hideDetailsCard = false,
  className = "",
}: CampusMapProps) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [internalStations, setInternalStations] = useState<Station[]>([]);
  const [internalProjectors, setInternalProjectors] = useState<Projector[]>([]);
  const [internalDay2Layer, setInternalDay2Layer] = useState(false);
  const [internalLocations, setInternalLocations] = useState<LatestLocation[]>([]);
  const [internalOccupancy, setInternalOccupancy] = useState<StationOccupancy[]>([]);
  const [selected, setSelected] = useState<Station | null>(null);

  const isControlled = propStations !== undefined;

  useEffect(() => {
    if (isControlled) return;
    let active = true;

    async function loadStations() {
      const { data } = await supabase.from("stations").select("*").order("id");
      if (active && data) setInternalStations(data as Station[]);
    }
    async function loadProjectors() {
      const { data } = await supabase.from("projectors").select("*");
      if (active && data) setInternalProjectors(data as Projector[]);
    }
    async function loadConfig() {
      const { data } = await supabase
        .from("game_config")
        .select("value")
        .eq("key", "day2_map_layer")
        .single();
      if (active) setInternalDay2Layer(data?.value === true || data?.value === "true");
    }
    async function loadLocations() {
      if (!showGroupPins) return;
      const { data } = await supabase.rpc("fn_latest_locations");
      if (active && data) setInternalLocations(data as LatestLocation[]);
    }
    async function loadOccupancy() {
      const { data } = await supabase.rpc("fn_public_station_occupancy");
      if (active && data) setInternalOccupancy(data as StationOccupancy[]);
    }

    loadStations();
    loadProjectors();
    loadConfig();
    loadLocations();
    loadOccupancy();

    const channel = supabase
      .channel("campus-map-internal")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stations" },
        loadStations
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projectors" },
        loadProjectors
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_config" },
        loadConfig
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_locations" },
        () => {
          loadLocations();
          loadOccupancy();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, showGroupPins, isControlled]);

  const stations = propStations ?? internalStations;
  const projectors = propProjectors ?? internalProjectors;
  const day2Layer = propDay2Layer ?? internalDay2Layer;
  const locations = propLocations ?? internalLocations;
  const occupancy = propOccupancy ?? internalOccupancy;

  const manualPins = locations.filter(
    (l) => l.source === "manual" && l.station_id !== null
  );

  function pinPosition(l: LatestLocation): { x: number; y: number } | null {
    const st = stations.find((s) => s.id === l.station_id);
    return st ? { x: Number(st.map_x), y: Number(st.map_y) } : null;
  }

  return (
    <div className={className}>
      <div className="card overflow-hidden p-0 shadow-raised">
        <svg
          viewBox="0 0 100 100"
          className="block w-full select-none"
          role="img"
          aria-label="XMUM Campus Map"
        >
          {/* Campus base zones */}
          <rect width="100" height="100" fill="#f6f4ef" />
          <rect x="8" y="14" width="30" height="32" rx="3" fill="#ece7dc" />
          <text
            x="23"
            y="12"
            textAnchor="middle"
            fontSize="3.4"
            fill="#8a857b"
            fontWeight="600"
          >
            A3 / A4 Block
          </text>
          <rect x="42" y="16" width="22" height="28" rx="3" fill="#ece7dc" />
          <text
            x="53"
            y="13"
            textAnchor="middle"
            fontSize="3.4"
            fill="#8a857b"
            fontWeight="600"
          >
            A5 Block
          </text>
          <rect x="66" y="36" width="22" height="26" rx="3" fill="#e3dfd6" />
          <text
            x="77"
            y="33"
            textAnchor="middle"
            fontSize="3.4"
            fill="#8a857b"
            fontWeight="600"
          >
            B1
          </text>
          <rect x="24" y="62" width="36" height="18" rx="3" fill="#e8efe3" />
          <text
            x="42"
            y="86"
            textAnchor="middle"
            fontSize="3.4"
            fill="#8a857b"
            fontWeight="600"
          >
            Courts
          </text>
          <ellipse cx="68" cy="82" rx="16" ry="9" fill="#e8efe3" />
          <text
            x="68"
            y="95"
            textAnchor="middle"
            fontSize="3.4"
            fill="#8a857b"
            fontWeight="600"
          >
            Track &amp; Field
          </text>

          {/* Stations */}
          {stations.map((s) => {
            const cx = Number(s.map_x);
            const cy = Number(s.map_y);
            const isHighlighted = highlightStationId === s.id;
            const r = isHighlighted ? 3.8 : 2.6;
            const occ =
              occupancy?.find((o) => o.station_id === s.id)
                ?.occupancy_count ?? 0;
            const isPk = Boolean(s.is_pk_day1);
            const cap = isPk ? 2 : 1;
            const fill = getStationDotFill(s.status, occ, isPk);
            const isWaiting = s.status === "available" && isPk && occ === 1;

            const statusLabel =
              s.status === "available"
                ? isWaiting
                  ? "Waiting for opponent (1/2)"
                  : "Available"
                : s.status === "in_progress"
                  ? "In progress"
                  : "Closed";

            return (
              <g
                key={s.id}
                onClick={() => {
                  setSelected(s);
                  onStationTap?.(s);
                }}
                className="cursor-pointer transition-transform hover:scale-110 active:scale-95"
              >
                <title>
                  {s.code} · {s.name} · {statusLabel}
                  {occ > 0
                    ? ` · ${occ}/${cap} group${occ > 1 ? "s" : ""} here`
                    : ""}
                </title>

                {/* Animated pulsating halo for 1/2 PK Waiting stations */}
                {isWaiting && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r + 1.8}
                    fill="none"
                    stroke="#d97706"
                    strokeWidth="0.8"
                    opacity="0.8"
                  >
                    <animate
                      attributeName="r"
                      values={`${r + 0.6};${r + 2.4};${r + 0.6}`}
                      dur="2s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.9;0.1;0.9"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}

                {/* Outer highlight ring if selected */}
                {isHighlighted && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r + 1.5}
                    fill="none"
                    stroke="var(--brand-1)"
                    strokeWidth="0.8"
                  />
                )}

                {/* Base dot */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={fill}
                  stroke="#fff"
                  strokeWidth="0.7"
                />

                {/* Inner ring for in_progress */}
                {s.status === "in_progress" && (
                  <circle cx={cx} cy={cy} r={r * 0.45} fill="#fff" />
                )}

                {/* Crossed X for closed stations */}
                {s.status === "closed" && (
                  <>
                    <line
                      x1={cx - r * 0.6}
                      y1={cy - r * 0.6}
                      x2={cx + r * 0.6}
                      y2={cy + r * 0.6}
                      stroke="#fff"
                      strokeWidth="0.6"
                    />
                    <line
                      x1={cx - r * 0.6}
                      y1={cy + r * 0.6}
                      x2={cx + r * 0.6}
                      y2={cy - r * 0.6}
                      stroke="#fff"
                      strokeWidth="0.6"
                    />
                  </>
                )}

                {/* Station Code Label */}
                <text
                  x={cx}
                  y={cy - 3.4}
                  textAnchor="middle"
                  fontSize="2.5"
                  fontWeight="700"
                  fill="#2c2a26"
                  className="select-none"
                >
                  {s.code}
                </text>
              </g>
            );
          })}

          {/* Day 2 layer: Projectors (FR-4.3) */}
          {day2Layer &&
            projectors.map((p) => (
              <g key={p.location}>
                <text
                  x={Number(p.map_x)}
                  y={Number(p.map_y) + 1.4}
                  textAnchor="middle"
                  fontSize="3"
                  fontWeight="800"
                  fill={p.activated_at ? "#f59e0b" : "var(--brand-2)"}
                >
                  {p.activated_at ? "ON" : "NFC"}
                </text>
                <text
                  x={Number(p.map_x)}
                  y={Number(p.map_y) + 6}
                  textAnchor="middle"
                  fontSize="2.4"
                  fontWeight="700"
                  fill={p.activated_at ? "#f59e0b" : "var(--brand-2)"}
                >
                  {p.activated_at ? "REVIVED" : p.location}
                </text>
              </g>
            ))}

          {/* Active Group Pins (Committee View / Faci View) */}
          {showGroupPins &&
            manualPins.map((l) => {
              const pos = pinPosition(l);
              if (!pos) return null;
              const stale = isStale(l.reported_at);
              return (
                <g
                  key={l.group_id}
                  opacity={stale ? 0.5 : 1}
                  className="pointer-events-none"
                >
                  <rect
                    x={pos.x - 3.8}
                    y={pos.y + 2.2}
                    width="7.6"
                    height="3.8"
                    rx="1.4"
                    fill="#0891b2"
                    stroke="#ffffff"
                    strokeWidth="0.4"
                  />
                  <text
                    x={pos.x}
                    y={pos.y + 5.1}
                    textAnchor="middle"
                    fontSize="2.4"
                    fontWeight="700"
                    fill="#fff"
                  >
                    G{l.group_id}
                  </text>
                </g>
              );
            })}
        </svg>
      </div>

      {/* Standalone card fallback (when not controlled by bottom sheet modal) */}
      {!hideDetailsCard && selected && (
        <div className="card mt-3 flex items-center justify-between p-3">
          <div>
            <p className="font-semibold text-ink">{selected.name}</p>
            <p className="text-xs text-ink-faint">{selected.area}</p>
          </div>
          <span
            className="chip"
            style={{
              backgroundColor: stationDotColor(selected.status) + "22",
              color: stationDotColor(selected.status),
            }}
          >
            {selected.status === "available"
              ? "Available"
              : selected.status === "in_progress"
                ? "In Progress"
                : "Closed"}
          </span>
        </div>
      )}

      {/* Group GPS pins list for Committee/Faci if standalone */}
      {!hideDetailsCard && showGroupPins && locations.length > 0 && (
        <div className="mt-3 space-y-1">
          {locations.map((l) => (
            <div
              key={l.group_id}
              className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-sm shadow-sm"
            >
              <span className="font-medium text-ink">{l.group_name}</span>
              <span className="text-xs text-ink-faint">
                {l.source === "manual"
                  ? (l.station_name ?? "Station")
                  : `GPS ±${Math.round(l.accuracy_m ?? 0)}m`}
                {" · "}
                <span className={isStale(l.reported_at) ? "text-red-500 font-semibold" : ""}>
                  {timeAgo(l.reported_at)}
                  {isStale(l.reported_at) && " (stale)"}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}