"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useState, type ReactNode } from "react";

import { canUseWebGL } from "@/components/map3d/webgl";

import { CampusMap2DView, type CampusMapViewProps } from "./CampusMap2DView";
import type { CampusMap3DViewProps } from "./CampusMap3DView";
import type { MapView } from "./useCampusMapData";

// Picks the map view: the 3D campus, or the 2D art when the device can't run
// 3D (no WebGL, or the 3D view fails) or the URL asks for it with ?map=2d.
// The 3D code (three.js) loads only when it is used.

/** The card while the 3D code loads; the same height as the 3D map's card. */
function MapLoading() {
  return (
    <div className="card overflow-hidden p-0">
      <div className="flex h-[clamp(260px,80vw,520px)] w-full items-center justify-center bg-paper-100 text-sm font-semibold text-ink-faint">
        Loading the 3D map…
      </div>
    </div>
  );
}

const CampusMap3DView = dynamic(() => import("./CampusMap3DView").then((m) => m.CampusMap3DView), {
  ssr: false,
  loading: MapLoading,
});

/** The view to show, null until checked in the browser, and a way to fall back to 2D. */
export function useMapView(): [MapView | null, () => void] {
  const [view, setView] = useState<MapView | null>(null);
  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get("map") === "2d";
    setView(forced || !canUseWebGL() ? "2d" : "3d");
  }, []);
  const fallBack = useCallback(() => setView("2d"), []);
  return [view, fallBack];
}

/**
 * Swaps to the 2D view if the 3D one throws. (A renderer that can't be made, or a device too slow even for the
 * lite scene, is reported through the 3D view's onFail instead.)
 */
class Fallback extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[campus map] 3D view failed, showing the 2D map", error);
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Scene options for the 3D view only (the dev preview sets them). */
export type SceneOptions = Pick<CampusMap3DViewProps, "mode" | "lite" | "intro" | "camera">;

export function CampusMapView({
  view,
  onFail,
  scene,
  ...props
}: CampusMapViewProps & { view: MapView | null; onFail: () => void; scene?: SceneOptions }) {
  if (view === null) return <MapLoading />;
  if (view === "2d") return <CampusMap2DView {...props} />;
  return (
    <Fallback onError={onFail}>
      <CampusMap3DView {...props} {...scene} onFail={onFail} />
    </Fallback>
  );
}
