"use client";

import { createContext, useContext } from "react";

// False while the /map page's campus map is parked off-screen between visits
// (PersistentCampusMap). Outside that provider, always true.
export const MapActiveContext = createContext(true);

export function useMapActive() {
  return useContext(MapActiveContext);
}
