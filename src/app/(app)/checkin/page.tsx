"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CampusMap } from "@/components/CampusMap";
import {
  Card,
  ErrorBanner,
  PageTitle,
  SuccessBanner,
} from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Station } from "@/lib/types";
import { friendlyError } from "@/lib/utils";

// FR-3.1 (P0): one-tap manual check-in — the primary fallback that always
// works. FR-3.2 (P1): opt-in GPS auto-report every 60s while foregrounded.
export default function CheckinPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Station | null>(null);
  const [gpsOn, setGpsOn] = useState(false);
  const gpsTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function checkin(station: Station) {
    setError(null);
    setNotice(null);
    const { error } = await supabase.rpc("fn_manual_checkin", {
      p_station_id: station.id,
    });
    if (error) setError(friendlyError(error));
    else setNotice(`Checked in at ${station.name}`);
    setPending(null);
  }

  function reportOnce() {
    if (!("geolocation" in navigator)) {
      setError("This device doesn't support GPS.");
      setGpsOn(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await supabase.rpc("fn_report_gps", {
          p_lat: pos.coords.latitude,
          p_lng: pos.coords.longitude,
          p_accuracy: pos.coords.accuracy,
        });
      },
      () => {
        setError(
          "GPS unavailable or permission denied — manual check-in still works."
        );
        setGpsOn(false);
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
    );
  }

  useEffect(() => {
    if (gpsOn) {
      reportOnce();
      gpsTimer.current = setInterval(reportOnce, 60_000);
    }
    return () => {
      if (gpsTimer.current) clearInterval(gpsTimer.current);
      gpsTimer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsOn]);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Location check-in"
        subtitle="Tap a station on the map, then confirm"
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <CampusMap showGroupPins onStationTap={setPending} />

      {pending && (
        <div className="fixed inset-x-0 bottom-20 z-50 px-4">
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
              <button onClick={() => checkin(pending)} className="btn-primary">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <Card className="flex items-center justify-between">
        <div>
          <p className="font-semibold">GPS auto-report</p>
          <p className="text-xs text-ink-faint">
            Sends your position every 60s while this page is open. Manual
            check-in always overrides stale GPS.
          </p>
        </div>
        <button
          onClick={() => setGpsOn((v) => !v)}
          className={gpsOn ? "btn-primary" : "btn-secondary"}
        >
          {gpsOn ? "On" : "Off"}
        </button>
      </Card>
    </div>
  );
}
