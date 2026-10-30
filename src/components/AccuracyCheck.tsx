"use client";

// Admin "Accuracy check" on the campus map.
//
// While it is on, the Admin's phone tracks its GPS, sends it to the server
// every 20 s (fn_report_admin_gps; only Admins can read it back), and keeps
// the last fixes so a tap on the map can save an averaged anchor
// (fn_admin_add_map_anchor). Saved anchors are added to the built-in ones in
// src/lib/mapGeo.ts and bend the 2D map only (the 3D map is drawn to true GPS).
// On the 3D map a tap measures instead, and each reading is logged on this
// device, so a walk round campus can tell a steady offset from GPS noise.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Crosshair, Trash2, X } from "lucide-react";

import { supabaseBrowser } from "@/lib/supabase/client";
import type { AdminCheckLocation, MapAnchor } from "@/lib/types";
import { friendlyError, timeAgo } from "@/lib/utils";

type Fix = { lat: number; lng: number; acc: number; t: number };

/** A fix this rough or worse is not used for an anchor. */
export const CHECK_MAX_ACCURACY_M = 20;
/** Fixes from this far back are averaged for an anchor. */
const AVERAGE_WINDOW_MS = 40_000;
const MIN_FIXES = 2;
const REPORT_EVERY_MS = 20_000;

const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 };

export interface AveragedFix {
  lat: number;
  lng: number;
  /** Mean accuracy of the fixes used, in metres. */
  accuracy: number;
  fixes: number;
}

/** One 3D reading: where the averaged GPS fix was, in metres east and north of the spot Admin tapped. */
export type CheckReading = { t: number; east: number; north: number; acc: number; fixes: number };

const CHECK_LOG_KEY = "campus-map-check-log";
const CHECK_LOG_MAX = 50;
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** "12 m NE": how far, and which way, the GPS fix is from the tapped spot. */
export function readingText({ east, north }: { east: number; north: number }): string {
  const m = Math.hypot(east, north);
  if (m < 0.5) return "0 m";
  const deg = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
  return `${Math.round(m)} m ${COMPASS[Math.round(deg / 45) % 8]}`;
}

/**
 * Readings made on this device, newest first. Kept in localStorage (not the server), so a walk round campus
 * survives a reload.
 */
export function useCheckLog() {
  const [log, setLog] = useState<CheckReading[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHECK_LOG_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setLog(parsed as CheckReading[]);
    } catch {
      // Private mode or a bad value: start empty.
    }
  }, []);
  const store = (next: CheckReading[]) => {
    try {
      localStorage.setItem(CHECK_LOG_KEY, JSON.stringify(next));
    } catch {
      // Private mode: the log lasts until reload.
    }
  };
  const add = useCallback((r: CheckReading) => {
    setLog((current) => {
      const next = [r, ...current].slice(0, CHECK_LOG_MAX);
      store(next);
      return next;
    });
  }, []);
  const clear = useCallback(() => {
    setLog([]);
    store([]);
  }, []);
  return { log, add, clear };
}

/**
 * Three or more readings: the average offset and the spread round it. A steady offset (average at least 5 m and
 * larger than the spread) means one shift for the whole map would fix it; otherwise it is GPS noise.
 */
function summarise(log: CheckReading[]) {
  if (log.length < 3) return null;
  const east = log.reduce((sum, r) => sum + r.east, 0) / log.length;
  const north = log.reduce((sum, r) => sum + r.north, 0) / log.length;
  const spread = Math.sqrt(log.reduce((sum, r) => sum + (r.east - east) ** 2 + (r.north - north) ** 2, 0) / log.length);
  const size = Math.hypot(east, north);
  return { east, north, spread, steady: size >= 5 && size > spread };
}

function CheckLog({ log, nowMs, onClear }: { log: CheckReading[]; nowMs: number; onClear: () => void }) {
  const [copied, setCopied] = useState(false);
  const summary = summarise(log);
  async function copy() {
    const rows = log.map((r) =>
      [new Date(r.t).toISOString(), r.east.toFixed(1), r.north.toFixed(1), Math.round(r.acc), r.fixes].join(","),
    );
    try {
      await navigator.clipboard.writeText(["time,east_m,north_m,accuracy_m,fixes", ...rows].join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="space-y-1 border-t border-paper-200 pt-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Readings on This Phone ({log.length})</p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={copy}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2 text-xs font-semibold hover:bg-paper-100"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={() => window.confirm("Clear the readings on this phone?") && onClear()}
            className="inline-flex min-h-[32px] items-center rounded-lg px-2 text-xs font-semibold text-red-600 hover:bg-red-50"
          >
            Clear
          </button>
        </div>
      </div>
      {summary && (
        <p className="text-xs">
          Average {readingText(summary)} over {log.length} readings, spread ±{Math.round(summary.spread)} m:{" "}
          <span className="font-semibold">
            {summary.steady
              ? "looks like a steady offset (one shift for the whole map would fix it)."
              : "looks like GPS noise (no fix needed)."}
          </span>
        </p>
      )}
      <ul className="divide-y divide-paper-200">
        {log.slice(0, 5).map((r) => (
          <li key={r.t} className="py-1 text-xs text-ink-faint">
            GPS {readingText(r)} of the tap / ±{Math.round(r.acc)} m / {r.fixes} fixes /{" "}
            {timeAgo(new Date(r.t).toISOString(), nowMs)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function useAccuracyCheck(active: boolean) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const fixes = useRef<Fix[]>([]);
  const lastReport = useRef(0);
  const [live, setLive] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [others, setOthers] = useState<AdminCheckLocation[]>([]);

  const onFix = useCallback(
    (pos: GeolocationPosition) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const fix = { lat, lng, acc: Number.isFinite(accuracy) ? accuracy : 9999, t: Date.now() };
      fixes.current = [...fixes.current.filter((f) => fix.t - f.t < 60_000), fix];
      setLive(fix);
      setError(null);
      if (fix.t - lastReport.current >= REPORT_EVERY_MS) {
        lastReport.current = fix.t;
        void supabase
          .rpc("fn_report_admin_gps", { p_lat: lat, p_lng: lng, p_accuracy: fix.acc })
          .then(({ error: rpcError }) => {
            if (rpcError) setError(friendlyError(rpcError));
          });
      }
    },
    [supabase],
  );

  const onError = useCallback((err: GeolocationPositionError) => {
    setError(
      err.code === err.PERMISSION_DENIED
        ? "Location is blocked for this site. Allow it in the browser to run the check."
        : err.code === err.TIMEOUT
          ? "Still looking for a GPS signal. Step into the open."
          : "Your phone can't find its location right now.",
    );
  }, []);

  useEffect(() => {
    if (!active) {
      fixes.current = [];
      lastReport.current = 0;
      setLive(null);
      setError(null);
      return;
    }
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setError("This browser does not support location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(onFix, onError, GEO_OPTIONS);
    let watchId: number | null = null;
    try {
      watchId = navigator.geolocation.watchPosition(onFix, onError, GEO_OPTIONS);
    } catch {
      // Some in-app browsers throw here; the timer below still asks.
    }
    // Standing still: watchPosition goes quiet, so ask now and then.
    const timer = setInterval(() => {
      const last = fixes.current[fixes.current.length - 1];
      if (!last || Date.now() - last.t >= 10_000) {
        navigator.geolocation.getCurrentPosition(onFix, () => {}, GEO_OPTIONS);
      }
    }, 5_000);
    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
    };
  }, [active, onFix, onError]);

  // Other Admins checking at the same time (and this one, as the server sees it).
  useEffect(() => {
    if (!active) {
      setOthers([]);
      return;
    }
    let on = true;
    async function load() {
      const { data } = await supabase.rpc("fn_admin_check_locations");
      if (on && data) setOthers(data as AdminCheckLocation[]);
    }
    void load();
    const timer = setInterval(load, REPORT_EVERY_MS);
    return () => {
      on = false;
      clearInterval(timer);
    };
  }, [active, supabase]);

  /** The averaged position for an anchor, or null when the GPS is not good enough yet. */
  const averaged = useCallback((): AveragedFix | null => {
    const now = Date.now();
    const good = fixes.current.filter(
      (f) => now - f.t <= AVERAGE_WINDOW_MS && f.acc <= CHECK_MAX_ACCURACY_M,
    );
    if (good.length < MIN_FIXES) return null;
    // Weight by 1/accuracy², so sharper fixes count more.
    let w = 0;
    let lat = 0;
    let lng = 0;
    let acc = 0;
    for (const f of good) {
      const k = 1 / Math.max(f.acc, 1) ** 2;
      w += k;
      lat += k * f.lat;
      lng += k * f.lng;
      acc += f.acc;
    }
    return { lat: lat / w, lng: lng / w, accuracy: acc / good.length, fixes: good.length };
  }, []);

  const goodFixes = live
    ? fixes.current.filter(
        (f) => live.t - f.t <= AVERAGE_WINDOW_MS && f.acc <= CHECK_MAX_ACCURACY_M,
      ).length
    : 0;

  return { live, error, others, averaged, goodFixes };
}

/** Accuracy check controls and the saved anchors, under the map switch. */
export function AccuracyCheckPanel({
  live,
  goodFixes,
  error,
  notice,
  anchors,
  nowMs,
  onDelete,
  onClose,
  measure = false,
  log = [],
  onClearLog,
}: {
  live: { acc: number } | null;
  goodFixes: number;
  error: string | null;
  notice: string | null;
  anchors: MapAnchor[];
  nowMs: number;
  onDelete: (id: number) => void;
  onClose: () => void;
  /** 3D map: a tap measures the GPS error and saves nothing to the server. The saved anchors only bend the 2D map. */
  measure?: boolean;
  /** 3D map: this device's readings (useCheckLog). */
  log?: CheckReading[];
  onClearLog?: () => void;
}) {
  const ready = goodFixes >= MIN_FIXES;
  return (
    <section className="card mb-2 space-y-2 border-sky-300 p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 font-semibold">
            <Crosshair className="h-4 w-4" /> Accuracy Check
          </h2>
          <p className="mt-0.5 text-xs text-ink-faint">
            {measure
              ? "Walk to a spot, check your pin, then tap the map where you really are (full screen is more precise). The map shows how far your GPS is off, and which way. Readings stay on this phone; nothing is saved to the map."
              : "Walk to a spot, check your pin, then tap the map where you really are (full screen is more precise). The tap saves a correction for the 2D map (the 3D map needs none)."}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="End accuracy check"
          className="shrink-0 rounded-lg p-1.5 hover:bg-paper-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="flex items-center gap-1.5 text-xs">
        <span
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${ready ? "bg-green-500" : "bg-amber-500"}`}
        />
        {live
          ? `GPS ±${Math.round(live.acc)} m / ${goodFixes} good fix${goodFixes === 1 ? "" : "es"} (need ${MIN_FIXES} at ±${CHECK_MAX_ACCURACY_M} m or better)`
          : "Finding your location…"}
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {notice && <p className="text-xs font-medium text-green-700">{notice}</p>}
      {measure && onClearLog && log.length > 0 && <CheckLog log={log} nowMs={nowMs} onClear={onClearLog} />}
      {anchors.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-semibold">
            {measure ? `Saved Corrections, 2D Map Only (${anchors.length})` : `Saved Corrections (${anchors.length})`}
          </summary>
          <ul className="mt-1 divide-y divide-paper-200">
            {anchors.map((a) => (
              <li key={a.id} className="flex items-center gap-2 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate">
                  {a.lat.toFixed(6)}, {a.lng.toFixed(6)} → ({Number(a.x).toFixed(1)}%,{" "}
                  {Number(a.y).toFixed(1)}%)
                  {a.accuracy_m != null ? ` / ±${Math.round(a.accuracy_m)} m` : ""} /{" "}
                  {timeAgo(a.created_at, nowMs)}
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(a.id)}
                  aria-label="Delete this correction"
                  className="shrink-0 rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
