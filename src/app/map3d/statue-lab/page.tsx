"use client";

import { TanKahKeeStatue } from "@/components/map3d/statue";
import StatueLab from "@/components/map3d/statue-lab/StatueLab";

// DRAFT: the Tan Kah Kee statue on its own, at real size. Development only.
export default function StatueLabPage() {
  return <StatueLab Statue={TanKahKeeStatue} name="Final" />;
}
