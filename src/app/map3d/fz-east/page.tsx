"use client";

import ZonePreview from "@/components/map3d/funfair/ZonePreview";
import { FunfairEast } from "@/components/map3d/funfair/east";

// DRAFT, dev only: the funfair's east zone in the map while it is built.
export default function FunfairEastPreview() {
  return <ZonePreview Zone={FunfairEast} />;
}
