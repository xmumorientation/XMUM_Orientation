"use client";

import { StaffLocationSwitch } from "@/components/StaffLocationSharing";
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
  const data = useCampusMapData({
    showGroupPins,
    canManageStations,
    bulbLayer: view === "2d",
    loadFunfair: view === "3d",
  });
  // Full-screen viewer. The inline map stays still so the page can scroll.
  const [fullscreen, setFullscreen] = useState(false);
  const panelView = view ?? "3d";

  return (
    <div>
      <StaffLocationSwitch />
      {view === "2d" && (
        <div className="mb-2 flex justify-center" aria-hidden={fullscreen}>
          <LayerSwitch data={data} dark={false} />
        </div>
      )}
      <MapToolbar data={data} canManageStations={canManageStations} view={panelView} />
      <nav aria-label={`Day ${data.day} map buildings`} className="mb-3 flex flex-wrap gap-2">
        <span className="w-full text-sm font-semibold">Day {data.day} stations / Choose a building</span>
        {[...new Set(data.mapStations.map((s) => s.area))].map((area) => (
          <button key={area} type="button" aria-pressed={data.clusterArea === area}
            className="btn-secondary min-h-[44px] min-w-[52px] px-3"
            onClick={() => { data.setLayer("stations"); data.setOpenBuilding(null); data.setClusterArea(area); data.setSelected(null); }}>
            {area}
          </button>
        ))}
      </nav>
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
