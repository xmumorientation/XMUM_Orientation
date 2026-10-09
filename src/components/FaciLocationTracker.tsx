"use client";

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

import { useProfile } from "@/components/ProfileProvider";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";

export type FaciLocationStatus =
  | "idle"
  | "requesting"
  | "active"
  | "prompt"
  | "denied"
  | "unavailable"
  | "error";

export interface FaciLocationContextValue {
  isFaci: boolean;
  status: FaciLocationStatus;
  lastReportedAt: Date | null;
  accuracy: number | null;
  error: string | null;
  requestLocation: () => Promise<void>;
}

const FaciLocationContext = createContext<FaciLocationContextValue>({
  isFaci: false,
  status: "idle",
  lastReportedAt: null,
  accuracy: null,
  error: null,
  requestLocation: async () => {},
});

// Best-effort geolocation configuration.
// enableHighAccuracy: true requests GPS satellite/hardware fix instead of coarse IP/cell.
const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 10000,
  timeout: 15000,
};

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

  const lastReportMs = useRef<number>(0);
  const reportingLock = useRef<boolean>(false);
  const watchIdRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const supabase = useMemo(() => supabaseBrowser(), []);

  const reportPosition = useCallback(
    async (coords: GeolocationCoordinates) => {
      if (reportingLock.current) return;
      if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return;
      if (Math.abs(coords.latitude) > 90 || Math.abs(coords.longitude) > 180) return;

      reportingLock.current = true;
      try {
        const { error: rpcError } = await supabase.rpc("fn_report_gps", {
          p_lat: coords.latitude,
          p_lng: coords.longitude,
          p_accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
        });

        if (rpcError) {
          setError(friendlyError(rpcError));
          setStatus("error");
        } else {
          lastReportMs.current = Date.now();
          setLastReportedAt(new Date());
          setAccuracy(coords.accuracy);
          setError(null);
          setStatus("active");
        }
      } catch (err: unknown) {
        setError(friendlyError(err));
        setStatus("error");
      } finally {
        reportingLock.current = false;
      }
    },
    [supabase]
  );

  const requestLocation = useCallback(async () => {
    if (!isFaci) return;
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setStatus("unavailable");
      setError("This device or browser does not support geolocation.");
      return;
    }

    setStatus("requesting");
    setError(null);

    return new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await reportPosition(pos.coords);
          resolve();
        },
        (geoError) => {
          if (geoError.code === geoError.PERMISSION_DENIED) {
            setStatus("denied");
            setError(
              "Location permission denied. Please enable precise location in browser settings."
            );
          } else if (geoError.code === geoError.POSITION_UNAVAILABLE) {
            setStatus("unavailable");
            setError("Location unavailable. Please check device GPS.");
          } else if (geoError.code === geoError.TIMEOUT) {
            setStatus("error");
            setError("Location request timed out. Retrying…");
          } else {
            setStatus("error");
            setError(geoError.message);
          }
          resolve();
        },
        GEOLOCATION_OPTIONS
      );
    });
  }, [isFaci, reportPosition]);

  useEffect(() => {
    if (!isFaci) {
      setStatus("idle");
      return;
    }

    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setStatus("unavailable");
      setError("Geolocation is not supported by your browser.");
      return;
    }

    // Check Permissions API if available to detect denied/prompt state early
    let permissionStatus: PermissionStatus | null = null;
    if (
      "permissions" in navigator &&
      typeof navigator.permissions?.query === "function"
    ) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((pStatus) => {
          permissionStatus = pStatus;
          if (pStatus.state === "denied") {
            setStatus("denied");
            setError(
              "Location permission is blocked. Please allow location in browser settings."
            );
          } else if (pStatus.state === "prompt" && !lastReportMs.current) {
            setStatus("prompt");
          }

          pStatus.onchange = () => {
            if (pStatus.state === "granted") {
              requestLocation();
            } else if (pStatus.state === "denied") {
              setStatus("denied");
              setError(
                "Location permission is blocked. Please allow location in browser settings."
              );
            } else if (pStatus.state === "prompt") {
              setStatus("prompt");
            }
          };
        })
        .catch(() => {
          // Ignore if permission query is unsupported
        });
    }

    // Always ask for precise location immediately when faci logs in / opens the app
    requestLocation();

    // Setup watchPosition to track movement (throttled to at most once per 30s)
    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const now = Date.now();
          if (now - lastReportMs.current >= 30_000) {
            reportPosition(pos.coords);
          }
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setStatus("denied");
          }
        },
        GEOLOCATION_OPTIONS
      );
    } catch {
      // Ignore if watchPosition throws
    }

    // Heartbeat timer: ensures fresh position is reported every 60s even when stationary
    heartbeatTimerRef.current = setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === "visible" && now - lastReportMs.current >= 50_000) {
        navigator.geolocation.getCurrentPosition(
          (pos) => reportPosition(pos.coords),
          () => {},
          GEOLOCATION_OPTIONS
        );
      }
    }, 60_000);

    // Refresh immediately when returning to the app from background/locked screen
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        if (now - lastReportMs.current >= 30_000) {
          navigator.geolocation.getCurrentPosition(
            (pos) => reportPosition(pos.coords),
            () => {},
            GEOLOCATION_OPTIONS
          );
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (heartbeatTimerRef.current !== null) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (permissionStatus) {
        permissionStatus.onchange = null;
      }
    };
  }, [isFaci, requestLocation, reportPosition]);

  const value = useMemo(
    () => ({
      isFaci,
      status,
      lastReportedAt,
      accuracy,
      error,
      requestLocation,
    }),
    [isFaci, status, lastReportedAt, accuracy, error, requestLocation]
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

/**
 * Top floating banner that appears when a facilitator is logged in
 * but precise location has not yet been permitted or is blocked.
 * Disappears once precise location has been reported.
 */
export function FaciLocationBanner() {
  const { isFaci, status, error, requestLocation, lastReportedAt } =
    useFaciLocation();
  const [dismissed, setDismissed] = useState(false);

  if (!isFaci) return null;
  // If active and location has been reported, hide banner
  if (status === "active" || lastReportedAt) return null;
  if (dismissed) return null;

  const isDenied = status === "denied";
  const isRequesting = status === "requesting";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(4.5rem+env(safe-area-inset-top))] z-[60] flex flex-col items-center px-4 lg:left-64 lg:top-5">
      <div className="card pointer-events-auto flex w-full max-w-lg items-center justify-between gap-3 border-amber-300 bg-amber-50/95 p-3.5 text-amber-950 shadow-glow backdrop-blur sm:p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
            <MapPin size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-amber-950 leading-tight">
              Precise location required for campus map
            </p>
            <p className="mt-0.5 text-xs text-amber-900/80 leading-snug">
              {isDenied
                ? "Location permission is blocked. Please allow location access in your browser settings so your group appears on the map."
                : "Facilitators must provide precise location so your group's live pin appears on the campus map."}
            </p>
            {error && !isDenied && (
              <p className="mt-1 text-[11px] font-medium text-red-600">
                {error}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => requestLocation()}
            disabled={isRequesting}
            className="btn btn-primary shrink-0 text-xs px-3.5 py-1.5 min-h-[36px] bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
          >
            {isRequesting ? "Locating…" : isDenied ? "Retry" : "Allow"}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss banner"
            className="rounded-lg p-1 text-amber-800 transition hover:bg-amber-100"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
