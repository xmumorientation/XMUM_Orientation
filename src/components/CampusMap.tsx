"use client";

import { useEffect, useMemo, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase/client";
import { stationDotColor } from "@/components/ui";
import type {
  LatestLocation,
  Projector,
  Station,
} from "@/lib/types";
import { cn, isStale, timeAgo } from "@/lib/utils";

// FR-4.1: custom SVG campus map (no Google Maps dependency).
// FR-4.4: station status changes propagate via Realtime.
// FR-4.3: Day 2 projector layer appears only when Admin toggles it.
export function CampusMap({
  showGroupPins = false,
  onStationTap,
  highlightStationId,
  soft = false,
}: {
  showGroupPins?: boolean;
  onStationTap?: (station: Station) => void;
  highlightStationId?: number | null;
  // Round 4/5 language: rounder frame, quieter rounded rows for the pin
  // list instead of flat white bars. Same data and subscriptions either way.
  soft?: boolean;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [stations, setStations] = useState<Station[]>([]);
  const [projectors, setProjectors] = useState<Projector[]>([]);
  const [day2Layer, setDay2Layer] = useState(false);
  const [locations, setLocations] = useState<LatestLocation[]>([]);
  const [selected, setSelected] = useState<Station | null>(null);

  useEffect(() => {
    let active = true;

    async function loadStations() {
      const { data } = await supabase.from("stations").select("*").order("id");
      if (active && data) setStations(data as Station[]);
    }
    async function loadProjectors() {
      const { data } = await supabase.from("projectors").select("*");
      if (active && data) setProjectors(data as Projector[]);
    }
    async function loadConfig() {
      const { data } = await supabase
        .from("game_config")
        .select("value")
        .eq("key", "day2_map_layer")
        .single();
      if (active) setDay2Layer(data?.value === true || data?.value === "true");
    }
    async function loadLocations() {
      if (!showGroupPins) return;
      const { data } = await supabase.rpc("fn_latest_locations");
      if (active && data) setLocations(data as LatestLocation[]);
    }

    loadStations();
    loadProjectors();
    loadConfig();
    loadLocations();

    const channel = supabase
      .channel("map-live")
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
        loadLocations
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, showGroupPins]);

  // Group pins cluster on the station they checked into (manual) or at
  // GPS coords mapped into the 0-100 viewBox is impossible without a real
  // geo reference — GPS pins render in a sidebar list instead.
  const manualPins = locations.filter((l) => l.source === "manual");

  function pinPosition(l: LatestLocation): { x: number; y: number } | null {
    const st = stations.find((s) => s.id === l.station_id);
    return st ? { x: Number(st.map_x), y: Number(st.map_y) } : null;
  }

  return (
    <div>
      <div
        className={cn(
          "overflow-hidden p-0",
          soft ? "rounded-3xl bg-white shadow-floating" : "card"
        )}
      >
        <svg viewBox="0 0 100 100" className="block w-full" role="img">
          {/* campus base: simple zones */}
          <rect width="100" height="100" fill="#f6f4ef" />
          <rect x="8" y="14" width="30" height="32" rx="3" fill="#ece7dc" />
          <text x="23" y="12" textAnchor="middle" fontSize="3.4" fill="#8a857b">
            A3 / A4 Block
          </text>
          <rect x="42" y="16" width="22" height="28" rx="3" fill="#ece7dc" />
          <text x="53" y="13" textAnchor="middle" fontSize="3.4" fill="#8a857b">
            A5 Block
          </text>
          <rect x="66" y="36" width="22" height="26" rx="3" fill="#e3dfd6" />
          <text x="77" y="33" textAnchor="middle" fontSize="3.4" fill="#8a857b">
            B1
          </text>
          <rect x="24" y="62" width="36" height="18" rx="3" fill="#e8efe3" />
          <text x="42" y="86" textAnchor="middle" fontSize="3.4" fill="#8a857b">
            Courts
          </text>
          <ellipse cx="68" cy="82" rx="16" ry="9" fill="#e8efe3" />
          <text x="68" y="95" textAnchor="middle" fontSize="3.4" fill="#8a857b">
            Track &amp; Field
          </text>

          {/* stations */}
          {stations.map((s) => {
            const cx = Number(s.map_x);
            const cy = Number(s.map_y);
            const r = highlightStationId === s.id ? 4 : 2.6;
            const statusLabel =
              s.status === "available"
                ? "Available"
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
                className="cursor-pointer"
              >
                {/* Status is conveyed by shape as well as colour (PRODUCT.md):
                    available = solid, in progress = ring, closed = crossed. */}
                <title>
                  {s.code} · {s.name} · {statusLabel}
                </title>
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={stationDotColor(s.status)}
                  stroke="#fff"
                  strokeWidth="0.7"
                />
                {s.status === "in_progress" && (
                  <circle cx={cx} cy={cy} r={r * 0.45} fill="#fff" />
                )}
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
                <text
                  x={cx}
                  y={cy - 3.6}
                  textAnchor="middle"
                  fontSize="2.6"
                  fontWeight="600"
                  fill="#4a463f"
                >
                  {s.code}
                </text>
              </g>
            );
          })}

          {/* Day 2 layer: projectors (FR-4.3) */}
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

          {/* group pins (committee view / faci own group) */}
          {showGroupPins &&
            manualPins.map((l) => {
              const pos = pinPosition(l);
              if (!pos) return null;
              const stale = isStale(l.reported_at);
              return (
                <g key={l.group_id} opacity={stale ? 0.45 : 1}>
                  <rect
                    x={pos.x - 4}
                    y={pos.y + 2}
                    width="8"
                    height="4"
                    rx="1.4"
                    fill="#0891b2"
                  />
                  <text
                    x={pos.x}
                    y={pos.y + 5}
                    textAnchor="middle"
                    fontSize="2.6"
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

      {selected && (
        <div
          className={cn(
            "mt-3 flex items-center justify-between p-3",
            soft ? "rounded-2xl bg-white shadow-raised" : "card"
          )}
        >
          <div>
            <p className="font-semibold">{selected.name}</p>
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

      {/* GPS reports can't be plotted on the illustrated map — list them */}
      {showGroupPins && (
        <div
          className={cn(
            "mt-3",
            soft
              ? "overflow-hidden rounded-2xl bg-white shadow-raised"
              : "space-y-1"
          )}
        >
          {locations.map((l, i) => (
            <div
              key={l.group_id}
              className={cn(
                "flex items-center justify-between px-3 py-1.5 text-sm",
                soft
                  ? i > 0 && "border-t border-paper-100"
                  : "rounded-lg bg-white"
              )}
            >
              <span className="font-medium">{l.group_name}</span>
              <span className="text-xs text-ink-faint">
                {l.source === "manual"
                  ? (l.station_name ?? "station")
                  : `GPS ±${Math.round(l.accuracy_m ?? 0)}m`}
                {" · "}
                <span className={isStale(l.reported_at) ? "text-red-500" : ""}>
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
