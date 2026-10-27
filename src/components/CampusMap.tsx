"use client";

import { StaffLocationSwitch } from "@/components/StaffLocationSharing";
import { useState } from "react";
import { Building2, CircleHelp, CircleDot, LayoutGrid, Trophy } from "lucide-react";
import { MAP_BUILDINGS } from "@/lib/mapBuildings";
import "@/components/campus-map/campus-map-controls.css";

import {
  CampusMapPanels,
  LayerSwitch,
  MapLegend,
  MapToolbar,
} from "@/components/campus-map/CampusMapPanels";
import { CampusMapView, useMapView } from "@/components/campus-map/CampusMapView";
import { useCampusMapData } from "@/components/campus-map/useCampusMapData";
import { useTennisSettings } from "@/components/map3d/tennis/settings";
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
  // The tennis game on the 3D map's courts, while Admin has it open (Live control).
  const tennis = useTennisSettings();
  const areas = [...new Set(data.mapStations.map((station) => station.area))].sort((a, b) => {
    const rank = (area: string) => {
      const index = MAP_BUILDINGS.findIndex((building) => building.area === area);
      return index < 0 ? MAP_BUILDINGS.length : index;
    };
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  function selectArea(area: string | null) {
    data.setLayer("stations");
    data.setOpenBuilding(null);
    data.setClusterArea(area);
    data.setSelected(null);
  }

  return (
    <div>
      <StaffLocationSwitch />
      {view === "2d" && (
        <div className="mb-2 flex justify-center" aria-hidden={fullscreen}>
          <LayerSwitch data={data} dark={false} />
        </div>
      )}
      <MapToolbar data={data} canManageStations={canManageStations} view={panelView} />
      {view === "2d" && <nav aria-label={`Day ${data.day} map buildings`} className="campus-map-buildings">
        <p className="campus-map-buildings-title">Day {data.day} / Find a station</p>
        <div className="campus-map-building-options">
          <button type="button" className="campus-map-building" aria-pressed={data.layer === "stations" && data.clusterArea === null}
            onClick={() => selectArea(null)}>
            <LayoutGrid size={18} aria-hidden /><span>All</span><span className="campus-map-building-count">{data.mapStations.length}</span>
          </button>
          {areas.map((area) => {
            const stations = data.mapStations.filter((station) => station.area === area);
            const available = stations.filter((station) => station.status === "available").length;
            const Icon = /^[AB]\d+$/.test(area) ? Building2 : area === "Track & Field" ? Trophy : area.includes("Court") ? CircleDot : CircleHelp;
            return <button key={area} type="button" aria-pressed={data.layer === "stations" && data.clusterArea === area}
              className="campus-map-building" title={`${area}: ${available} available / ${stations.length} stations`}
              aria-label={`${area}, ${available} available of ${stations.length} stations`}
              onClick={() => selectArea(area)}>
              <Icon size={18} aria-hidden /><span>{area}</span><span className="campus-map-building-count" aria-hidden>{stations.length}</span>
            </button>;
          })}
        </div>
      </nav>}
      <CampusMapView
        view={view}
        onFail={fallBack}
        scene={{ tennis }}
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
