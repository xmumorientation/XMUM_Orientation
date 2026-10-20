"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase/client";
import { RISK_TIER_META, type Station, type StationStatus } from "@/lib/types";

// Every station, read only, under the map on /map for HOF, HOGM, Committee
// and GM: status, location, game, how full it is and which groups are
// checked in (not for a GM, who gets no group locations). A GM's own station
// is marked "Yours". Changing stations is HOGM's Game control and Admin, not here.
// Sits inside .gc-map, so it uses the Game control (.gc) classes.

type DayFilter = "all" | 1 | 2;
type StatusFilter = "all" | StationStatus;
type CheckIn = { group_id: number; group_name: string; station_id: number | null };

const STATUS: { value: StationStatus; label: string; tone: string }[] = [
  { value: "available", label: "Available", tone: "ok" },
  { value: "in_progress", label: "Busy", tone: "warn" },
  { value: "closed", label: "Closed", tone: "off" },
];

export function StationBoard({
  myStationId = null,
  showCheckIns = true,
}: {
  myStationId?: number | null;
  showCheckIns?: boolean;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [stations, setStations] = useState<Station[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [day, setDay] = useState<DayFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [s, c, l] = await Promise.all([
      supabase.from("stations").select("*").order("day").order("id"),
      supabase.rpc("fn_station_group_counts"),
      supabase.rpc("fn_latest_locations"),
    ]);
    setStations((s.data as Station[]) ?? []);
    setCounts(
      Object.fromEntries(((c.data as { station_id: number; group_count: number }[]) ?? []).map((r) => [r.station_id, r.group_count]))
    );
    setCheckIns((l.data as CheckIn[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`sb-stations-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stations" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "station_occupancy" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  const ofDay = stations.filter((s) => day === "all" || s.day === day);
  const visible = ofDay.filter((s) => status === "all" || s.status === status);
  const meta = (v: StationStatus) => STATUS.find((x) => x.value === v)!;

  return (
    <section className="gc-stack gc-board" aria-labelledby="sb-title">
      <h2 id="sb-title" className="gc-eyebrow">All stations</h2>
      <div className="gc-seg" role="tablist" aria-label="Day">
        {(["all", 1, 2] as DayFilter[]).map((d) => (
          <button key={d} type="button" role="tab" aria-selected={day === d} onClick={() => setDay(d)}>
            {d === "all" ? "All days" : `Day ${d}`}
          </button>
        ))}
      </div>
      <div className="gc-filter" role="group" aria-label="Status">
        {[{ value: "all" as const, label: "All", tone: "live" }, ...STATUS].map((x) => (
          <button key={x.value} type="button" aria-pressed={status === x.value} data-tone={x.tone} onClick={() => setStatus(x.value)}>
            {x.label}
            <b>{x.value === "all" ? ofDay.length : ofDay.filter((s) => s.status === x.value).length}</b>
          </button>
        ))}
      </div>

      <ul className="gc-list">
        {visible.map((s) => {
          const open = openId === s.id;
          const here = checkIns.filter((c) => c.station_id === s.id);
          const n = counts[s.id] ?? here.length;
          return (
            <li key={s.id} className="gc-card gc-fold" data-open={open || undefined} data-mine={s.id === myStationId || undefined}>
              <button type="button" className="gc-fold-head" aria-expanded={open} onClick={() => setOpenId(open ? null : s.id)}>
                <span className="gc-fold-name">
                  {s.name}
                  {s.id === myStationId && <span className="gc-chip gc-chip-mine">Yours</span>}
                  <small>
                    Day {s.day} · {s.code}
                    {n > 0 && ` · ${n} group${n !== 1 ? "s" : ""} here`}
                  </small>
                </span>
                <span className="gc-chip" data-tone={meta(s.status).tone}>{meta(s.status).label}</span>
                <ChevronDown size={18} aria-hidden className="gc-fold-chev" />
              </button>
              {open && (
                <div className="gc-fold-body">
                  <dl className="gc-facts">
                    <div><dt>Location</dt><dd>{s.code}</dd></div>
                    <div><dt>Block</dt><dd>{s.area || "—"}</dd></div>
                    <div><dt>Game</dt><dd>{s.purpose || "—"}</dd></div>
                    <div><dt>Groups here</dt><dd>{n}{s.max_groups ? ` / ${s.max_groups}` : ""}</dd></div>
                    {s.day === 2 && (
                      <div><dt>Risk · entry</dt><dd>{RISK_TIER_META[s.risk_tier].label} · −{s.entry_cost}</dd></div>
                    )}
                  </dl>
                  {showCheckIns && (
                    <p className="gc-muted">
                      {here.length ? `Checked in: ${here.map((c) => c.group_name).join(", ")}` : "No group checked in."}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {visible.length === 0 && <li className="gc-empty">No stations here.</li>}
      </ul>
    </section>
  );
}
