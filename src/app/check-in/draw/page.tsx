import type { Metadata, Viewport } from "next";

import CheckInDraw from "@/components/demo/CheckInDraw";

/**
 * DEMO: Counter QR landing — fake client-side group draw.
 * Production: server assigns group after counter scan; access via signed pass,
 * not open URL. No Scan UI on this page.
 */
export const metadata: Metadata = {
  title: "Check-in draw — Vortexa",
  description: "Demo counter check-in: drawing your orientation group.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07060b",
};

export default function CheckInDrawPage() {
  return <CheckInDraw />;
}
