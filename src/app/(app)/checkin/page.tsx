"use client";

import { useEffect, useMemo, useState } from "react";

import { CampusMap } from "@/components/CampusMap";
import { useFaciLocation } from "@/components/FaciLocationTracker";
import {
  Card,
  ErrorBanner,
  PageTitle,
  SuccessBanner,
} from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Station } from "@/lib/types";
import { cn, friendlyError, timeAgo } from "@/lib/utils";

// FR-3.1 (P0): one-tap manual check-in — the primary fallback that always
// works. FR-3.2 (P1): automatic precise GPS reporting while logged in.
export default function CheckinPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Station | null>(null);
  const {
    status: faciGpsStatus,
    lastReportedAt: faciGpsReportedAt,
    requestLocation: requestFaciGps,
  } = useFaciLocation();

  const [current, setCurrent] = useState<Station | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadCurrent() {
    const { data: stationId } = await supabase.rpc("fn_my_station");
    if (typeof stationId !== "number") {
      setCurrent(null);
      return;
    }
    const { data } = await supabase
      .from("stations")
      .select("*")
      .eq("id", stationId)
      .maybeSingle();
    setCurrent((data as Station) ?? null);
  }

  useEffect(() => {
    loadCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Best-effort position for the "are you near the station?" warning.
  // Check-in never waits long for it and never fails because of it.
  function getPosition(): Promise<GeolocationPosition | null> {
    if (!("geolocation" in navigator)) return Promise.resolve(null);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        () => resolve(null),
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 8000 }
      );
    });
  }

  async function checkin(station: Station) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const pos = await getPosition();
    const { data, error } = await supabase.rpc("fn_manual_checkin", {
      p_station_id: station.id,
      p_lat: pos?.coords.latitude ?? null,
      p_lng: pos?.coords.longitude ?? null,
      p_accuracy: pos?.coords.accuracy ?? null,
    });
    if (error) setError(friendlyError(error));
    else {
      const farAway = (data as { far_away?: boolean } | null)?.far_away;
      setNotice(
        farAway
          ? `Checked in at ${station.name}, but you seem far from this station. Is it the right one?`
          : `Checked in at ${station.name}`
      );
      await loadCurrent();
    }
    setPending(null);
    setBusy(false);
  }

  async function uncheckin() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error } = await supabase.rpc("fn_uncheckin");
    if (error) setError(friendlyError(error));
    else {
      setNotice("Your group has left the station.");
      await loadCurrent();
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Location check-in"
        subtitle="Choose a station from the list, or tap one on the map"
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      {current && (
        <Card className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-ink-faint">Your group is at</p>
            <p className="truncate font-semibold">
              {current.code} · {current.name}
            </p>
          </div>
          <button
            onClick={uncheckin}
            disabled={busy}
            className="btn-secondary shrink-0"
          >
            Leave station
          </button>
        </Card>
      )}

      <CampusMap
        showGroupPins
        onStationTap={setPending}
        hasSelection={pending !== null}
      />

      {pending && (
        <div className="fixed inset-x-0 bottom-20 z-[90] px-4">
          <div className="card mx-auto flex max-w-lg items-center justify-between gap-3 p-4 shadow-glow">
            <div>
              <p className="font-semibold">Check in at {pending.name}?</p>
              <p className="text-xs text-ink-faint">{pending.area}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPending(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => checkin(pending)}
                disabled={busy}
                className="btn-primary"
              >
                {busy ? "Checking in…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Card className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold">GPS live reporting</p>
            <span
              className={cn(
                "chip",
                faciGpsStatus === "active"
                  ? "bg-green-100 text-green-800"
                  : "bg-amber-100 text-amber-800"
              )}
            >
              {faciGpsStatus === "active" ? "Active" : "Paused"}
            </span>
          </div>
          <p className="text-xs text-ink-faint mt-1">
            {faciGpsStatus === "active"
              ? `Automatically reporting your group's live position for the campus map${
                  faciGpsReportedAt
                    ? ` (last sent ${timeAgo(faciGpsReportedAt.toISOString())})`
                    : ""
                }.`
              : "Location access is required so your group appears on the campus map."}
          </p>
        </div>
        {faciGpsStatus !== "active" && (
          <button
            onClick={() => requestFaciGps()}
            className="btn-primary shrink-0 text-sm"
          >
            Enable GPS
          </button>
        )}
      </Card>
    </div>
  );
}
