import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "./globals.css";
import { cn } from "@/lib/utils";

// Self-hosted at build time by next/font — no runtime dependency on a font
// CDN, which matters on flaky venue wifi during the live event.
const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "XMUM Orientation 2026",
    template: "%s | XMUM Orientation 2026",
  },
  description:
    "One ticket, One Ride, Discover adventure Inside. The official XMUM Orientation 2026 platform.",
  metadataBase: new URL("https://vortexa.xmum.edu.my"),
  openGraph: {
    title: "Vortexa | XMUM Orientation 2026",
    description:
      "Two days of campus games, teams, and new beginnings. 28 & 29 Nov 2026.",
    siteName: "XMUM Orientation 2026",
    locale: "en_MY",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vortexa | XMUM Orientation 2026",
    description:
      "Two days of campus games, teams, and new beginnings. 28 & 29 Nov 2026.",
  },
  icons: {
    icon: "/xmum-logo-badge.png",
    apple: "/xmum-logo-badge.png",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fdfcfa",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn(display.variable, body.variable, mono.variable)}
    >
      <body className="min-h-dvh font-sans">
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
