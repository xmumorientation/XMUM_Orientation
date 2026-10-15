"use client";

import { useState } from "react";

import {
  CampusMapPanels,
  LayerSwitch,
  MapLegend,
  MapToolbar,
} from "@/components/campus-map/CampusMapPanels";
import { CampusMapView, useMapView } from "@/components/campus-map/CampusMapView";
import { useCampusMapData } from "@/components/campus-map/useCampusMapData";
import type { Station } from "@/lib/types";

// FR-4.1: campus map. Data and state live in useCampusMapData, the controls
// and lists in CampusMapPanels, and the picture in CampusMapView: the 3D
// campus, or the 2D art when the device can't run 3D (or with ?map=2d).
export function CampusMap({
  showGroupPins = false,
  onStationTap,
  highlightStationId,
  canManageStations = false,
  hasSelection,
}: {
  showGroupPins?: boolean;
  onStationTap?: (station: Station) => void;
  highlightStationId?: number | null;
  /** Admin on the campus map page can add and edit stations per building. */
  canManageStations?: boolean;
  /** When set, the available-station list follows this instead of the map's own selection. */
  hasSelection?: boolean;
}) {
  const [view, fallBack] = useMapView();
  // The Lightbulbs layer is on the 2D map only; the 3D map lists the bulbs under it.
  const data = useCampusMapData({ showGroupPins, canManageStations, bulbLayer: view === "2d" });
  // Full-screen viewer. The inline map stays still so the page can scroll.
  const [fullscreen, setFullscreen] = useState(false);
  const panelView = view ?? "3d";

  return (
    <div>
      {view === "2d" && (
        <div className="mb-2 flex justify-center" aria-hidden={fullscreen}>
          <LayerSwitch data={data} dark={false} />
        </div>
      )}
      <MapToolbar data={data} canManageStations={canManageStations} view={panelView} />
      <CampusMapView
        view={view}
        onFail={fallBack}
        data={data}
        showGroupPins={showGroupPins}
        canManageStations={canManageStations}
        highlightStationId={highlightStationId}
        onStationTap={onStationTap}
        fullscreen={fullscreen}
        onFullscreenChange={setFullscreen}
        legend={<MapLegend layer={data.layer} showGroupPins={showGroupPins} />}
      />
      <CampusMapPanels
        data={data}
        showGroupPins={showGroupPins}
        canManageStations={canManageStations}
        hasSelection={hasSelection}
        onStationTap={onStationTap}
        view={panelView}
      />
    </div>
  );
}
