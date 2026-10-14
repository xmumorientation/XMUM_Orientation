"use client";

// Admin "Accuracy check" on the campus map.
//
// While it is on, the Admin's phone tracks its GPS, sends it to the server
// every 20 s (fn_report_admin_gps; only Admins can read it back), and keeps
// the last fixes so a tap on the map can save an averaged anchor
// (fn_admin_add_map_anchor). Saved anchors are added to the built-in ones in
// src/lib/mapGeo.ts on every map.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Trash2, X } from "lucide-react";

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
}: {
  live: { acc: number } | null;
  goodFixes: number;
  error: string | null;
  notice: string | null;
  anchors: MapAnchor[];
  nowMs: number;
  onDelete: (id: number) => void;
  onClose: () => void;
}) {
  const ready = goodFixes >= MIN_FIXES;
  return (
    <section className="card mb-2 space-y-2 border-sky-300 p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 font-semibold">
            <Crosshair className="h-4 w-4" /> Accuracy check
          </h2>
          <p className="mt-0.5 text-xs text-ink-faint">
            Walk to a spot, check your pin, then tap the map where you really are
            (full screen is more precise). The tap saves a correction for every map.
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
          ? `GPS ±${Math.round(live.acc)} m · ${goodFixes} good fix${goodFixes === 1 ? "" : "es"} (need ${MIN_FIXES} at ±${CHECK_MAX_ACCURACY_M} m or better)`
          : "Finding your location…"}
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {notice && <p className="text-xs font-medium text-green-700">{notice}</p>}
      {anchors.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-semibold">
            Saved corrections ({anchors.length})
          </summary>
          <ul className="mt-1 divide-y divide-paper-200">
            {anchors.map((a) => (
              <li key={a.id} className="flex items-center gap-2 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate">
                  {a.lat.toFixed(6)}, {a.lng.toFixed(6)} → ({Number(a.x).toFixed(1)}%,{" "}
                  {Number(a.y).toFixed(1)}%)
                  {a.accuracy_m != null ? ` · ±${Math.round(a.accuracy_m)} m` : ""} ·{" "}
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
