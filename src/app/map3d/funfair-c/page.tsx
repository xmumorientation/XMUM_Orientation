"use client";

import FunfairLab from "@/components/map3d/funfair-lab/FunfairLab";
import { FunfairRides } from "@/components/map3d/funfair-lab/styleC";

// DRAFT: funfair ride style C bench. Development only.
export default function FunfairLabCPage() {
  return <FunfairLab Rides={FunfairRides} name="Style C" />;
}
