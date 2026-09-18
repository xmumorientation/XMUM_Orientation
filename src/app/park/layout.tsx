import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Enter the Park — Orientation 2026",
  description:
    "A cinematic prototype: enter a futuristic neon carnival marking the start of your university journey.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05010c",
};

export default function ParkLayout({ children }: { children: React.ReactNode }) {
  // Full-bleed dark stage; the prototype owns the whole viewport.
  return <div className="min-h-dvh bg-black">{children}</div>;
}
