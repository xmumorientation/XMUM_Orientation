import { Alfa_Slab_One, Outfit, Shrikhand } from "next/font/google";

// Scoped to the public homepage only (applied on the page wrapper), so these
// faces are not requested on the authenticated app routes.
//
// Brand guideline faces are Brasika (titles) and Karimun (subtitles). They are
// not on Google Fonts, so Shrikhand and Alfa Slab One stand in for now. To
// switch, load the licensed files with `next/font/local` under the same
// variable names — nothing else needs to change.
export const vxDisplay = Shrikhand({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-vx-display",
  display: "swap",
});

export const vxSlab = Alfa_Slab_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-vx-slab",
  display: "swap",
});

export const nexusBody = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-nexus-body",
  display: "swap",
});
