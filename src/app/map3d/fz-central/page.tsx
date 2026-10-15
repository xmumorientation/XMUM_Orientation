"use client";

import ZonePreview from "@/components/map3d/funfair/ZonePreview";
import { FunfairCentral } from "@/components/map3d/funfair/central";

// DRAFT, dev only: the funfair's central zone in the map while it is built.
export default function FunfairCentralPreview() {
  return <ZonePreview Zone={FunfairCentral} />;
}
