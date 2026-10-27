"use client";

import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { CampusMap as CampusMapComponent } from "@/components/CampusMap";

import { MapActiveContext } from "./mapActive";

// Loaded on first use, so the app shell does not carry the map's code on every page.
const CampusMap = dynamic(() => import("@/components/CampusMap").then((m) => m.CampusMap), { ssr: false });

// Keeps the campus map alive between visits to /map. Building the 3D map is
// the slow part (a WebGL renderer, the campus geometry and textures, every
// shader, the intro swoop), and it used to happen on every visit because the
// map unmounted with the page. Now the map is rendered once, here in the app
// shell, into its own element. The /map page holds a slot and the element is
// moved into it; on leaving, the element is parked off-screen and the map is
// paused (no drawing, no polling, no realtime; see mapActive.ts), so coming
// back shows the same scene at once and only reloads the data.
//
// A visit whose URL carries a parameter the map reads when it mounts
// (MOUNT_PARAMS: the activation arrival, Admin's funfair preview, ?map=2d,
// ?layer=bulbs) gets a fresh map, so those still play. A map left unused for
// EVICT_MS is dropped to free the phone's memory; the next visit builds it again.

type MapProps = ComponentProps<typeof CampusMapComponent>;

const MOUNT_PARAMS = ["arrival", "funfair_preview", "map", "layer", "perf"];
const EVICT_MS = 10 * 60 * 1000;

interface Shown {
  props: MapProps;
  /** Changing it mounts a fresh map. */
  key: number;
  active: boolean;
}

interface PersistentMapApi {
  attach: (slot: HTMLDivElement, props: MapProps) => void;
  detach: (slot: HTMLDivElement) => void;
  update: (props: MapProps) => void;
}

const ApiContext = createContext<PersistentMapApi | null>(null);

function mountSignature() {
  const params = new URLSearchParams(window.location.search);
  return MOUNT_PARAMS.map((name) => params.get(name) ?? "").join("|").replace(/^\|+$/, "");
}

export function PersistentMapProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const host = useRef<HTMLDivElement | null>(null);
  const park = useRef<HTMLDivElement>(null);
  const signature = useRef<string | null>(null);
  const lastSlot = useRef<HTMLDivElement | null>(null);
  const evictTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const attach = useCallback((slot: HTMLDivElement, props: MapProps) => {
    if (evictTimer.current) {
      clearTimeout(evictTimer.current);
      evictTimer.current = null;
    }
    if (!host.current) {
      host.current = document.createElement("div");
      host.current.className = "persistent-campus-map";
    }
    slot.appendChild(host.current);
    const sig = mountSignature();
    // The same slot again is React Strict Mode re-running the effect, not a new visit.
    const sameVisit = slot === lastSlot.current;
    const fresh = !sameVisit && (sig !== "" || sig !== signature.current);
    signature.current = sig;
    lastSlot.current = slot;
    setShown((current) => ({
      props,
      key: (current?.key ?? 0) + (current && !fresh ? 0 : 1),
      active: true,
    }));
  }, []);

  const detach = useCallback((slot: HTMLDivElement) => {
    const el = host.current;
    if (!el || el.parentNode !== slot) return;
    // Park at the same width, so the canvas is not resized on the way out and back.
    if (park.current) {
      park.current.style.width = `${slot.clientWidth || window.innerWidth}px`;
      park.current.appendChild(el);
    }
    setShown((current) => (current ? { ...current, active: false } : current));
    evictTimer.current = setTimeout(() => {
      evictTimer.current = null;
      signature.current = null;
      lastSlot.current = null;
      setShown(null);
    }, EVICT_MS);
  }, []);

  const update = useCallback((props: MapProps) => {
    setShown((current) => (current ? { ...current, props } : current));
  }, []);

  useEffect(
    () => () => {
      if (evictTimer.current) clearTimeout(evictTimer.current);
    },
    [],
  );

  const api = useMemo(() => ({ attach, detach, update }), [attach, detach, update]);

  return (
    <ApiContext.Provider value={api}>
      {children}
      {/* Off-screen, invisible and inert, but laid out, so the parked canvas keeps its size. */}
      <div
        ref={park}
        aria-hidden
        inert
        style={{ position: "fixed", left: 0, top: 0, transform: "translateX(-300vw)", visibility: "hidden", pointerEvents: "none" }}
      />
      {shown &&
        host.current &&
        createPortal(
          <MapActiveContext.Provider value={shown.active}>
            <CampusMap key={shown.key} {...shown.props} />
          </MapActiveContext.Provider>,
          host.current,
        )}
    </ApiContext.Provider>
  );
}

/**
 * The campus map, kept alive between visits (see above). Same props as
 * CampusMap. Outside PersistentMapProvider it is a plain CampusMap.
 */
export function PersistentCampusMap(props: MapProps) {
  const api = useContext(ApiContext);
  const slot = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;

  useLayoutEffect(() => {
    const el = slot.current;
    if (!api || !el) return;
    api.attach(el, latest.current);
    return () => api.detach(el);
  }, [api]);

  const { showGroupPins, onStationTap, highlightStationId, canManageStations, hasSelection } = props;
  useEffect(() => {
    api?.update({ showGroupPins, onStationTap, highlightStationId, canManageStations, hasSelection });
  }, [api, showGroupPins, onStationTap, highlightStationId, canManageStations, hasSelection]);

  if (!api) return <CampusMap {...props} />;
  return <div ref={slot} />;
}
