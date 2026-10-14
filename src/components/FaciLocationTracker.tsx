"use client";

// Sends a Faci's phone position to fn_report_gps while the app is open.
//
// A web page cannot read GPS once the tab is in the background, the screen is
// locked or the browser is closed, on any phone. So:
// * each group has three Facis, and the map uses the best recent fix from
//   any of their phones (fn_group_positions);
// * "Keep tracking" holds the screen awake (Wake Lock API) on one phone;
// * a fix is sent as soon as the app comes back to the front;
// * when a Faci reopens the app after their group was off the map for a
//   while, they are told so.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MapPin, X } from "lucide-react";

import { LocationHelp, type LocationProblem } from "@/components/LocationHelp";
import { useProfile } from "@/components/ProfileProvider";
import { detectBrowserEnv, type BrowserEnv } from "@/lib/browserEnv";
import { GPS_FADED_MS, PRECISE_ACCURACY_M } from "@/lib/mapGeo";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { GroupPosition } from "@/lib/types";
import { friendlyError } from "@/lib/utils";

export type FaciLocationStatus =
  | "idle"
  | "requesting"
  | "active"
  | "imprecise"
  | "prompt"
  | "denied"
  | "unavailable"
  | "error";

export type WakeLockState = "off" | "on" | "unsupported" | "failed";

export interface FaciLocationContextValue {
  isFaci: boolean;
  status: FaciLocationStatus;
  lastReportedAt: Date | null;
  accuracy: number | null;
  error: string | null;
  env: BrowserEnv | null;
  requestLocation: () => void;
  /** "Keep tracking": hold the screen awake while the app is open. */
  keepAwake: boolean;
  setKeepAwake: (on: boolean) => void;
  wakeLock: WakeLockState;
  /** Minutes the group was off the map before this phone came back, or null. */
  gapMinutes: number | null;
  dismissGap: () => void;
}

const FaciLocationContext = createContext<FaciLocationContextValue>({
  isFaci: false,
  status: "idle",
  lastReportedAt: null,
  accuracy: null,
  error: null,
  env: null,
  requestLocation: () => {},
  keepAwake: false,
  setKeepAwake: () => {},
  wakeLock: "off",
  gapMinutes: null,
  dismissGap: () => {},
});

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 10_000,
  timeout: 20_000,
};

/** Least time between two reports while moving. */
const REPORT_INTERVAL_MS = 20_000;
/** Least time between two reports even when one is forced (resume, tap). The server ignores faster ones. */
const FORCED_GAP_MS = 10_000;
/** Ask for a fresh fix this often when standing still (watchPosition goes quiet). */
const HEARTBEAT_MS = 20_000;
/** After a timeout, try again this soon. */
const TIMEOUT_RETRY_MS = 10_000;
/** Check whether the group was off the map when the app comes back after this long. */
const RESUME_GAP_CHECK_MS = 2 * 60 * 1000;

const KEEP_AWAKE_KEY = "faci-keep-awake";

const DENIED_TEXT = "Location is blocked for this site.";

export function FaciLocationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = useProfile();
  const isFaci = profile.role === "faci";

  const [status, setStatus] = useState<FaciLocationStatus>("idle");
  const [lastReportedAt, setLastReportedAt] = useState<Date | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [env, setEnv] = useState<BrowserEnv | null>(null);
  const [keepAwake, setKeepAwakeState] = useState(false);
  const [wakeLock, setWakeLock] = useState<WakeLockState>("off");
  const [gapMinutes, setGapMinutes] = useState<number | null>(null);

  // Time of the last report attempt, successful or not. Throttling on the
  // attempt (not the success) stops a failing phone from retrying every second.
  const lastAttemptMs = useRef(0);
  const lastSuccessMs = useRef(0);
  const inFlight = useRef(false);
  const hiddenAtMs = useRef<number | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeSentinel = useRef<WakeLockSentinel | null>(null);

  const supabase = useMemo(() => supabaseBrowser(), []);

  const report = useCallback(
    async (coords: GeolocationCoordinates, forced: boolean) => {
      if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return;
      if (Math.abs(coords.latitude) > 90 || Math.abs(coords.longitude) > 180) return;
      if (inFlight.current) return;
      const now = Date.now();
      if (now - lastAttemptMs.current < (forced ? FORCED_GAP_MS : REPORT_INTERVAL_MS)) {
        return;
      }
      lastAttemptMs.current = now;
      inFlight.current = true;

      const acc = Number.isFinite(coords.accuracy) ? coords.accuracy : null;
      try {
        const { error: rpcError } = await supabase.rpc("fn_report_gps", {
          p_lat: coords.latitude,
          p_lng: coords.longitude,
          p_accuracy: acc,
        });
        if (rpcError) {
          setError(friendlyError(rpcError));
          setStatus("error");
        } else {
          lastSuccessMs.current = Date.now();
          setLastReportedAt(new Date());
          setAccuracy(acc);
          setError(null);
          setStatus(acc == null || acc > PRECISE_ACCURACY_M ? "imprecise" : "active");
        }
      } catch (err: unknown) {
        setError(
          typeof navigator !== "undefined" && !navigator.onLine
            ? "No internet connection. Your location will be sent when you are back online."
            : friendlyError(err)
        );
        setStatus("error");
      } finally {
        inFlight.current = false;
      }
    },
    [supabase]
  );

  // Handles an error from getCurrentPosition, or (fromWatch) watchPosition.
  const onGeoError = useCallback(
    (geoError: GeolocationPositionError, fromWatch: boolean, retry: () => void) => {
      if (geoError.code === geoError.PERMISSION_DENIED) {
        setStatus("denied");
        setError(DENIED_TEXT);
        return;
      }
      // watchPosition reports passing hiccups; the heartbeat covers those.
      if (fromWatch) return;
      const recentlyOk = Date.now() - lastSuccessMs.current < 2 * 60 * 1000;
      if (geoError.code === geoError.TIMEOUT) {
        if (!recentlyOk) {
          setStatus("requesting");
          setError("Still looking for a GPS signal. Step outside or near a window.");
        }
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(retry, TIMEOUT_RETRY_MS);
        return;
      }
      if (recentlyOk) return;
      if (geoError.code === geoError.POSITION_UNAVAILABLE) {
        setStatus("unavailable");
        setError("Your phone can't find its location right now.");
      } else {
        setStatus("error");
        setError(geoError.message || "Location failed.");
      }
    },
    []
  );

  const getFix = useCallback(
    (forced: boolean) => {
      if (!isFaci || typeof navigator === "undefined" || !("geolocation" in navigator)) {
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => void report(pos.coords, forced),
        (err) => onGeoError(err, false, () => getFix(true)),
        GEOLOCATION_OPTIONS
      );
    },
    [isFaci, report, onGeoError]
  );

  const requestLocation = useCallback(() => {
    if (!isFaci) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unavailable");
      setError("This browser does not support location.");
      return;
    }
    // Only show "Locating…" when nothing is on the map yet; otherwise keep the
    // current state until the new fix arrives.
    setStatus((s) => (s === "active" || s === "imprecise" ? s : "requesting"));
    // A tap is a fresh try: allow it straight away.
    lastAttemptMs.current = 0;
    getFix(true);
  }, [isFaci, getFix]);

  // Was the group off the map before this phone came back? Checked before
  // this phone reports, so its own fix does not hide the gap.
  const checkGap = useCallback(async () => {
    const { data } = await supabase.rpc("fn_group_positions");
    const own = (data as GroupPosition[] | null)?.find(
      (g) => g.group_id === profile.group_id
    );
    if (!own) return;
    const times = [own.gps_at, own.checkin_at]
      .filter((t): t is string => !!t)
      .map((t) => new Date(t).getTime());
    if (times.length === 0) return;
    const gap = Date.now() - Math.max(...times);
    if (gap > GPS_FADED_MS) setGapMinutes(Math.round(gap / 60_000));
  }, [supabase, profile.group_id]);

  // ── Wake lock ──────────────────────────────────────────────────────

  const releaseWake = useCallback(() => {
    const sentinel = wakeSentinel.current;
    wakeSentinel.current = null;
    if (sentinel) void sentinel.release().catch(() => {});
  }, []);

  const acquireWake = useCallback(async () => {
    if (!("wakeLock" in navigator)) {
      setWakeLock("unsupported");
      return;
    }
    if (wakeSentinel.current || document.visibilityState !== "visible") return;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      wakeSentinel.current = sentinel;
      setWakeLock("on");
      // The browser drops the lock whenever the page is hidden.
      sentinel.addEventListener("release", () => {
        if (wakeSentinel.current === sentinel) wakeSentinel.current = null;
        setWakeLock((w) => (w === "on" ? "off" : w));
      });
    } catch {
      setWakeLock("failed");
    }
  }, []);

  const setKeepAwake = useCallback((on: boolean) => {
    setKeepAwakeState(on);
    try {
      if (on) localStorage.setItem(KEEP_AWAKE_KEY, "1");
      else localStorage.removeItem(KEEP_AWAKE_KEY);
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  }, []);

  useEffect(() => {
    if (!isFaci) return;
    try {
      if (localStorage.getItem(KEEP_AWAKE_KEY) === "1") setKeepAwakeState(true);
    } catch {
      // ignore
    }
  }, [isFaci]);

  useEffect(() => {
    if (!isFaci) return;
    if (keepAwake) void acquireWake();
    else {
      releaseWake();
      setWakeLock((w) => (w === "unsupported" ? w : "off"));
    }
  }, [isFaci, keepAwake, acquireWake, releaseWake]);

  // ── Tracking ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!isFaci) {
      setStatus("idle");
      return;
    }

    const detected = detectBrowserEnv();
    setEnv(detected);
    if (!detected.geolocation || !detected.secure) {
      setStatus("unavailable");
      setError(
        detected.secure
          ? "This browser does not support location."
          : "Location only works on the secure (https) site."
      );
      return;
    }

    let permissionStatus: PermissionStatus | null = null;
    let cancelled = false;
    if (typeof navigator.permissions?.query === "function") {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((p) => {
          if (cancelled) return;
          permissionStatus = p;
          if (p.state === "denied") {
            setStatus("denied");
            setError(DENIED_TEXT);
          } else if (p.state === "prompt") {
            // Don't overwrite "Locating…" or a working state.
            setStatus((s) => (s === "idle" ? "prompt" : s));
          }
          p.onchange = () => {
            if (p.state === "granted") {
              lastAttemptMs.current = 0;
              getFix(true);
            } else if (p.state === "denied") {
              setStatus("denied");
              setError(DENIED_TEXT);
            } else {
              setStatus("prompt");
            }
          };
        })
        .catch(() => {
          // Safari before 16 has no geolocation permission query.
        });
    }

    // First fix: check the gap first, then report.
    setStatus("requesting");
    void checkGap().finally(() => {
      if (!cancelled) getFix(true);
    });

    // Moving: watchPosition fires on movement; report() throttles.
    let watchId: number | null = null;
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => void report(pos.coords, false),
        (err) => onGeoError(err, true, () => getFix(true)),
        GEOLOCATION_OPTIONS
      );
    } catch {
      // Some in-app browsers throw here.
    }

    // Standing still: watchPosition goes quiet, so ask now and then.
    const heartbeat = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastAttemptMs.current >= HEARTBEAT_MS
      ) {
        getFix(false);
      }
    }, 5_000);

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAtMs.current = Date.now();
        return;
      }
      const hiddenFor = hiddenAtMs.current ? Date.now() - hiddenAtMs.current : 0;
      hiddenAtMs.current = null;
      if (hiddenFor >= RESUME_GAP_CHECK_MS) {
        void checkGap().finally(() => getFix(true));
      } else {
        getFix(true);
      }
    }
    function onOnline() {
      getFix(true);
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearInterval(heartbeat);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, [isFaci, report, getFix, onGeoError, checkGap]);

  // Re-take the wake lock when the app comes back to the front.
  useEffect(() => {
    if (!isFaci || !keepAwake) return;
    function onVisibility() {
      if (document.visibilityState === "visible") void acquireWake();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isFaci, keepAwake, acquireWake]);

  useEffect(() => releaseWake, [releaseWake]);

  const dismissGap = useCallback(() => setGapMinutes(null), []);

  const value = useMemo(
    () => ({
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
      gapMinutes,
      dismissGap,
    }),
    [
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
      gapMinutes,
      dismissGap,
    ]
  );

  return (
    <FaciLocationContext.Provider value={value}>
      {children}
    </FaciLocationContext.Provider>
  );
}

export function useFaciLocation() {
  return useContext(FaciLocationContext);
}

/** The problem the banner should explain, most important first, or null. */
function bannerProblem(
  status: FaciLocationStatus,
  env: BrowserEnv | null,
  gapMinutes: number | null,
  error: string | null
): LocationProblem | "gap" | "prompt" | "requesting" | "error" | null {
  if (env?.inApp) return "inapp";
  if (env && !env.secure) return "insecure";
  if (status === "denied") return "denied";
  if (status === "unavailable") return "unavailable";
  if (status === "imprecise") return "imprecise";
  if (status === "error") return "error";
  if (status === "prompt") return "prompt";
  if (gapMinutes != null) return "gap";
  // A normal first fix takes a second or two; only explain a slow one.
  if (status === "requesting" && error) return "requesting";
  return null;
}

const BANNER_TITLES: Record<string, string> = {
  inapp: "Open this page in your browser",
  insecure: "Location needs the secure site",
  denied: "Location is blocked",
  unavailable: "Your phone can't find its location",
  imprecise: "Your location is only approximate",
  error: "Your location wasn't sent",
  prompt: "Allow location for the campus map",
  requesting: "Finding your location…",
  gap: "Your group was off the map",
};

/**
 * Floating banner for a Faci whose location isn't reaching the map, with
 * steps for their phone. A dismissed banner comes back when the problem
 * changes (for example, permission is turned off later).
 */
export function FaciLocationBanner() {
  const {
    isFaci,
    status,
    error,
    env,
    requestLocation,
    gapMinutes,
    dismissGap,
    keepAwake,
    setKeepAwake,
  } = useFaciLocation();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  if (!isFaci) return null;
  const problem = bannerProblem(status, env, gapMinutes, error);
  if (!problem) return null;
  if (dismissedKey === problem) return null;

  const helpProblem: LocationProblem | null =
    problem === "inapp" ||
    problem === "insecure" ||
    problem === "denied" ||
    problem === "unavailable" ||
    problem === "imprecise"
      ? problem
      : null;

  let message: string;
  switch (problem) {
    case "gap":
      message = `Nobody in your group had the app open for ${gapMinutes} min, so Committee couldn't see you. Keep it open on at least one phone${keepAwake ? "." : ", with Keep tracking on."}`;
      break;
    case "imprecise":
      message =
        "Your phone is sharing a rough location (off by more than 100 m), so your group's pin may be in the wrong place.";
      break;
    case "prompt":
      message =
        "Your group's live pin on the campus map comes from the Facis' phones. Tap Allow, then allow location when your phone asks.";
      break;
    case "requesting":
      message = error ?? "Allow location if your phone asks.";
      break;
    default:
      message = error ?? "Your group's pin can't be updated from this phone.";
  }

  const showRetry = problem !== "gap" && problem !== "inapp" && problem !== "insecure";

  function dismiss() {
    if (problem === "gap") dismissGap();
    setDismissedKey(problem);
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(4.5rem+env(safe-area-inset-top))] z-[60] flex flex-col items-center px-4 lg:top-[76px]">
      <div
        role="status"
        className="card pointer-events-auto w-full max-w-lg border-amber-300 bg-amber-50/95 p-3.5 text-amber-950 shadow-glow backdrop-blur sm:p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
              <MapPin size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight text-amber-950">
                {BANNER_TITLES[problem]}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-amber-900/80">{message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="-m-1 shrink-0 rounded-lg p-2 text-amber-800 transition hover:bg-amber-100"
          >
            <X size={16} />
          </button>
        </div>

        {helpProblem && env && (
          <details
            className="mt-2 text-xs text-amber-950"
            open={helpProblem !== "imprecise"}
          >
            <summary className="cursor-pointer font-semibold">How to fix it</summary>
            <LocationHelp problem={helpProblem} env={env} className="mt-1.5" />
          </details>
        )}

        {(showRetry || (problem === "gap" && !keepAwake)) && (
          <div className="mt-2.5 flex justify-end gap-2">
            {problem === "gap" && !keepAwake && (
              <button
                type="button"
                onClick={() => {
                  setKeepAwake(true);
                  dismiss();
                }}
                className="btn min-h-[36px] bg-amber-600 px-3.5 py-1.5 text-xs text-white hover:bg-amber-700"
              >
                Turn on Keep tracking
              </button>
            )}
            {showRetry && (
              <button
                type="button"
                onClick={requestLocation}
                disabled={status === "requesting"}
                className="btn min-h-[36px] bg-amber-600 px-3.5 py-1.5 text-xs text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {status === "requesting"
                  ? "Locating…"
                  : problem === "prompt"
                    ? "Allow"
                    : "Try again"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
