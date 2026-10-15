"use client";

import FunfairLab from "@/components/map3d/funfair-lab/FunfairLab";
import { FunfairRides } from "@/components/map3d/funfair-lab/styleB";

// DRAFT: funfair ride style B bench. Development only.
export default function FunfairLabBPage() {
  return <FunfairLab Rides={FunfairRides} name="Style B" />;
}
