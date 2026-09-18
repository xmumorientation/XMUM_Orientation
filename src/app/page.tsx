import type { Metadata } from "next";

import OrientationHome from "@/components/home/OrientationHome";
import { nexusBody, nexusDisplay } from "@/components/home/fonts";

export const metadata: Metadata = {
  title: "NEXUS '26 — Orientation 2026",
  description:
    "Enter the Park. A futuristic neon carnival marking the start of your university journey — Orientation 2026.",
};

// Public landing: the cinematic Orientation homepage (no auth required).
// Scoped NEXUS fonts are applied here (server) and cascade into the homepage.
export default function Home() {
  return (
    <div className={`${nexusDisplay.variable} ${nexusBody.variable}`}>
      <OrientationHome />
    </div>
  );
}
