import type { Metadata } from "next";

import OrientationHome from "@/components/home/OrientationHome";
import { nexusBody, vxDisplay, vxSlab } from "@/components/home/fonts";

export const metadata: Metadata = {
  title: { absolute: "Vortexa" },
  description: "XMUM 26/12 Orientation",
};

// Public landing: the Vortexa Orientation Welcome page (no auth required).
// Scoped Welcome page fonts are applied here (server) and cascade into the page.
export default function Home() {
  return (
    <div className={`${vxDisplay.variable} ${vxSlab.variable} ${nexusBody.variable}`}>
      <OrientationHome />
    </div>
  );
}
