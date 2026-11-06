// Start the existing lazy chunk on navigation intent; import() deduplicates it
// with the map view's loader. A failed prefetch must not block navigation.
export function preloadCampusMap() {
  return import("./CampusMap3DView");
}

export function prefetchCampusMap(href: string) {
  if (href === "/map" || href === "/meeting-nfc/map") void preloadCampusMap().catch(() => {});
}
