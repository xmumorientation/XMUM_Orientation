import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "./globals.css";
import { DesignVariantProvider } from "@/components/DesignVariantProvider";
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
  title: "XMUM Orientation 2026",
  description:
    "Official platform for XMUM Orientation — attendance, campus map and the Big Game.",
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
        <DesignVariantProvider>{children}</DesignVariantProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
