"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useFaciLocation } from "@/components/FaciLocationTracker";
import { LocationHelp } from "@/components/LocationHelp";
import { useProfile } from "@/components/ProfileProvider";
import { FoldBody } from "@/components/staff/game/parts";
import { GPS_FRESH_MS } from "@/lib/mapGeo";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { FaciStatus } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

/**
 * A Faci's own location sharing: whether this phone is sending, the "Keep
 * tracking" switch, and which of the group's Faci phones are sharing now.
 * Folds to its header; the status line and Share Location stay visible.
 */
export function FaciTrackingPanel() {
  const profile = useProfile();
  const {
    isFaci,
    status,
    lastReportedAt,
    accuracy,
    error,
    env,
    requestLocation,
    keepAwake,
    setKeepAwake,
    wakeLock,
  } = useFaciLocation();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [facis, setFacis] = useState<FaciStatus[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [open, setOpen] = useState(false);

  const groupId = profile.group_id;

  useEffect(() => {
    if (!isFaci || groupId == null) return;
    let active = true;
    async function load() {
      const { data } = await supabase.rpc("fn_group_faci_status", {
        p_group_id: groupId,
      });
      if (active && data) setFacis(data as FaciStatus[]);
    }
    void load();
    const timer = setInterval(() => {
      setNowMs(Date.now());
      void load();
    }, 20_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isFaci, groupId, supabase, lastReportedAt]);

  if (!isFaci) return null;

  const sharing = status === "active" || status === "imprecise";
  const tone = status === "active" ? "bg-green-500" : status === "imprecise" ? "bg-amber-500" : "bg-red-500";
  let line: string;
  if (sharing && lastReportedAt) {
    line = `Sharing${accuracy != null ? ` / ±${Math.round(accuracy)} m` : ""} / sent ${timeAgo(lastReportedAt.toISOString(), nowMs)}`;
    if (status === "imprecise") line += " / rough location";
  } else if (status === "requesting") {
    line = error ?? "Finding your location…";
  } else if (status === "idle" || status === "prompt") {
    line = "Not sharing yet. Tap Share Location.";
  } else {
    line = error ?? "Not sharing.";
  }

  const sharingNow = facis.filter(
    (f) => f.last_gps_at && nowMs - new Date(f.last_gps_at).getTime() <= GPS_FRESH_MS
  ).length;

  return (
    <section className="card mb-3 p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="flex w-full items-center gap-1.5 text-left font-semibold"
            >
              Your Location Sharing
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-ink-faint transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-faint">
            <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone}`} />
            <span className="min-w-0">{line}</span>
          </p>
          {!open && groupId != null && facis.length > 0 && (
            <p className="mt-0.5 text-xs text-ink-faint">
              {sharingNow} of {facis.length} group phones sharing / Keep Tracking{" "}
              {keepAwake ? "on" : "off"}
            </p>
          )}
        </div>
        {!sharing && (
          <button
            type="button"
            onClick={requestLocation}
            disabled={status === "requesting"}
            className="btn-primary shrink-0 px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {status === "requesting" ? "Locating…" : "Share Location"}
          </button>
        )}
      </div>

      <FoldBody open={open}>
        <div className="space-y-3 pt-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              role="switch"
              checked={keepAwake}
              onChange={(e) => setKeepAwake(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-green-600"
            />
            <span className="min-w-0">
              <span className="block font-medium">Keep Tracking</span>
              <span className="block text-xs text-ink-faint">
                Keeps the screen on so your group stays on the map. A locked phone
                stops sharing. One phone per group is enough.
              </span>
              {keepAwake && wakeLock === "on" && (
                <span className="mt-1 block text-xs font-medium text-green-700">
                  Screen will stay on while this page is open.
                </span>
              )}
            </span>
          </label>
          {keepAwake && (wakeLock === "unsupported" || wakeLock === "failed") && env && (
            <div className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-950">
              <LocationHelp problem="nowake" env={env} />
            </div>
          )}

          {groupId != null && facis.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink-soft">
                Your Group&apos;s Faci Phones ({sharingNow} of {facis.length} sharing now)
              </p>
              <ul className="mt-1 space-y-0.5">
                {facis.map((f) => {
                  const fresh =
                    f.last_gps_at &&
                    nowMs - new Date(f.last_gps_at).getTime() <= GPS_FRESH_MS;
                  return (
                    <li key={f.user_id} className="flex items-center gap-2 text-xs">
                      <span
                        className={`inline-block h-2 w-2 shrink-0 rounded-full ${fresh ? "bg-green-500" : "bg-stone-300"}`}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {f.full_name ?? "Faci"}
                        {f.user_id === profile.id ? " (you)" : ""}
                      </span>
                      <span className="shrink-0 text-ink-faint">
                        {f.last_gps_at ? timeAgo(f.last_gps_at, nowMs) : "not yet"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {groupId == null && (
            <p className="text-xs text-red-600">
              Your account isn&apos;t in a group yet, so your location can&apos;t be shown. Ask an Admin.
            </p>
          )}
        </div>
      </FoldBody>
    </section>
  );
}
