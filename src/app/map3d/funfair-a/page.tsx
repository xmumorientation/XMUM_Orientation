"use client";

import FunfairLab from "@/components/map3d/funfair-lab/FunfairLab";
import { FunfairRides } from "@/components/map3d/funfair-lab/styleA";

// DRAFT: funfair ride style A bench. Development only.
export default function FunfairLabAPage() {
  return <FunfairLab Rides={FunfairRides} name="Style A" />;
}
