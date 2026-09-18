import { Exo_2, Outfit } from "next/font/google";

// Scoped to the public homepage only (applied on the .nexus wrapper), so these
// display/body faces are not requested on the authenticated app routes.
export const nexusDisplay = Exo_2({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  variable: "--font-nexus-display",
  display: "swap",
});

export const nexusBody = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-nexus-body",
  display: "swap",
});
