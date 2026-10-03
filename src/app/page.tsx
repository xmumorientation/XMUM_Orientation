import type { Metadata } from "next";

import OrientationHome from "@/components/home/OrientationHome";
import { nexusBody, vxDisplay, vxSlab } from "@/components/home/fonts";

export const metadata: Metadata = {
  title: "Vortexa — XMUM Orientation 2026",
  description:
    "One ticket, One Ride, Discover adventure Inside. Enter Vortexa, a futuristic neon carnival marking the start of your university journey at XMUM.",
};

// Public landing: the Vortexa Orientation homepage (no auth required).
// Scoped homepage fonts are applied here (server) and cascade into the page.
export default function Home() {
  return (
    <div className={`${vxDisplay.variable} ${vxSlab.variable} ${nexusBody.variable}`}>
      <OrientationHome />
    </div>
  );
}
