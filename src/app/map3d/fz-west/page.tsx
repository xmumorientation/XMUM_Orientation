"use client";

import ZonePreview from "@/components/map3d/funfair/ZonePreview";
import { FunfairWest } from "@/components/map3d/funfair/west";

// DRAFT, dev only: the funfair's west zone in the map while it is built.
export default function FunfairWestPreview() {
  return <ZonePreview Zone={FunfairWest} />;
}
