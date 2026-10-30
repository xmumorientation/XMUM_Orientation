"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useProfile } from "@/components/ProfileProvider";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";

type SharingState = "off" | "starting" | "waiting" | "sharing" | "stopping" | "stopFailed";
const SharingContext = createContext<{ state: SharingState; error: string | null; toggle: () => void } | null>(null);

export function StaffLocationProvider({ children }: { children: React.ReactNode }) {
  const profile = useProfile();
  const allowed = profile.role === "hof" || profile.role === "hogm";
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [state, setState] = useState<SharingState>(allowed ? "starting" : "off");
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const watcher = useRef<number | null>(null);
  const sharing = useRef(false);
  const generation = useRef(0);
  const lastSent = useRef(0);
  const reporting = useRef(false);
  const busy = useRef(false);

  const clearWatch = useCallback(() => {
    if (watcher.current !== null) navigator.geolocation.clearWatch(watcher.current);
    watcher.current = null;
    if (heartbeat.current) clearInterval(heartbeat.current);
    heartbeat.current = null;
  }, []);

  const stop = useCallback(async () => {
    generation.current += 1;
    clearWatch();
    setState("stopping");
    const { error } = await supabase.rpc("fn_staff_location_share", { p_enabled: false });
    if (error) {
      // Keep Stop available: the server pin may still exist until its two-minute expiry.
      setError(`Phone tracking stopped, but removing the map pin failed. Tap Stop to retry. ${friendlyError(error)}`);
      setState("stopFailed");
      return false;
    }
    sharing.current = false;
    setError(null);
    setState("off");
    window.dispatchEvent(new Event("staff-location-change"));
    return true;
  }, [supabase, clearWatch]);

  async function toggle() {
    if (!allowed || busy.current) return;
    busy.current = true;
    try {
      if (sharing.current) { await stop(); return; }
      if (!navigator.geolocation) { setError("This browser does not support location sharing."); return; }
      setError(null);
      setState("starting");
      const { error } = await supabase.rpc("fn_staff_location_share", { p_enabled: true });
      if (error) { setError(friendlyError(error)); setState("off"); return; }
      if (!mounted.current) { await supabase.rpc("fn_staff_location_share", { p_enabled: false }); return; }
      sharing.current = true;
      const run = ++generation.current;
      lastSent.current = 0;
      setState("waiting");
      const report = async ({ coords }: GeolocationPosition) => {
        if (run !== generation.current || !sharing.current || reporting.current || document.visibilityState !== "visible" || Date.now() - lastSent.current < 12_000) return;
        reporting.current = true;
        try {
          const { error } = await supabase.rpc("fn_report_staff_gps", {
            p_lat: coords.latitude, p_lng: coords.longitude, p_accuracy: coords.accuracy,
          });
          if (run !== generation.current) return;
          if (error) { setError(friendlyError(error)); setState("waiting"); return; }
          lastSent.current = Date.now();
          setError(null);
          setState("sharing");
          window.dispatchEvent(new Event("staff-location-change"));
        } finally { reporting.current = false; }
      };
      const failed = async (positionError: GeolocationPositionError) => {
        if (run !== generation.current) return;
        if (positionError.code === 1) {
          if (await stop()) setError("Location permission was denied. Allow location in your browser settings, then try again.");
        } else {
          setState("waiting");
          setError("Waiting for GPS. Keep the app open and try moving outdoors.");
        }
      };
      const options = { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 };
      watcher.current = navigator.geolocation.watchPosition(report, failed, options);
      heartbeat.current = setInterval(() => {
        if (document.visibilityState === "visible" && run === generation.current) navigator.geolocation.getCurrentPosition(report, failed, options);
      }, 15_000);
    } catch {
      setError("Could not change location sharing. Please try again.");
      setState(sharing.current ? "waiting" : "off");
    } finally { busy.current = false; }
  }

  useEffect(() => {
    mounted.current = true;
    const run = ++generation.current;
    if (allowed) {
      busy.current = true;
      // A new page session starts private, including after reloading an old sharing tab.
      void supabase.rpc("fn_staff_location_share", { p_enabled: false }).then(({ error }) => {
        if (!mounted.current || generation.current !== run) return;
        sharing.current = !!error;
        if (error) setError("Could not confirm that sharing is off. Tap Stop to retry.");
        setState(error ? "stopFailed" : "off");
        busy.current = false;
        window.dispatchEvent(new Event("staff-location-change"));
      });
    }
    return () => {
      mounted.current = false;
      generation.current += 1;
      clearWatch();
      if (sharing.current) void supabase.rpc("fn_staff_location_share", { p_enabled: false });
    };
  }, [supabase, clearWatch, allowed]);

  return <SharingContext.Provider value={{ state, error, toggle }}>{children}</SharingContext.Provider>;
}

export function StaffLocationSwitch() {
  const profile = useProfile();
  const value = useContext(SharingContext);
  if (!value || (profile.role !== "hof" && profile.role !== "hogm")) return null;
  const { state, error, toggle } = value;
  const on = state === "waiting" || state === "sharing" || state === "stopping" || state === "stopFailed";
  return <section className="card mb-3 p-3">
    <div className="flex items-center justify-between gap-3">
      <div><p className="font-semibold">Share My Location</p><p className="text-xs text-ink-faint">{state === "off" ? "Off / Your location is private" : state === "sharing" ? "Sharing while this app is open" : state === "stopFailed" ? "Phone tracking stopped / Pin removal pending" : state === "stopping" ? "Removing your location…" : "Waiting for your phone’s location…"}</p></div>
      <button type="button" role="switch" aria-checked={on} aria-label="Share my location" className="btn-secondary min-h-[44px] px-4" disabled={state === "starting" || state === "stopping"} onClick={() => void toggle()}>{on ? "Stop Sharing" : "Share Location"}</button>
    </div>
    {error && <p role="alert" className="mt-2 text-sm">{error}</p>}
    <p className="mt-2 text-xs text-ink-faint">Staff and Facilitators can see your pin. Locked or inactive phones may stop updating; pins disappear after 2 minutes without an update.</p>
  </section>;
}
