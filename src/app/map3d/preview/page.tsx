import { notFound } from "next/navigation";

import MapPreview from "./MapPreview";

// DRAFT (map-3d-draft branch): the campus map on mock data, per role, to see
// the 3D view (and the 2D one with ?view=2d) without signing in. Development
// only; no Supabase. Options are listed in MapPreview.tsx.
export default function MapPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <MapPreview />;
}
