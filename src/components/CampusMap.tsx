"use client";

import { useState } from "react";

import { CampusMap2DView } from "@/components/campus-map/CampusMap2DView";
import {
  CampusMapPanels,
  LayerSwitch,
  MapLegend,
  MapToolbar,
} from "@/components/campus-map/CampusMapPanels";
import { useCampusMapData } from "@/components/campus-map/useCampusMapData";
import type { Station } from "@/lib/types";

// FR-4.1: campus map. Data and state live in useCampusMapData, the controls
// and lists in CampusMapPanels, and the picture in CampusMap2DView.
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
  const data = useCampusMapData({ showGroupPins, canManageStations });
  // Full-screen viewer. The inline map stays still so the page can scroll.
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <div>
      <div className="mb-2 flex justify-center" aria-hidden={fullscreen}>
        <LayerSwitch data={data} dark={false} />
      </div>
      <MapToolbar data={data} canManageStations={canManageStations} />
      <CampusMap2DView
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
      />
    </div>
  );
}
