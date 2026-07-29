import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "./globals.css";
import { DesignVariantProvider } from "@/components/DesignVariantProvider";
import { cn } from "@/lib/utils";

// Self-hosted at build time — no runtime dependency on a font CDN, which
// matters on flaky venue wifi during the live event. General Sans ships
// weights 400/500/600/700 only (no 800/900); font-black usages elsewhere
// fall back to browser synthetic bolding on top of 700.
const sans = localFont({
  src: [
    {
      path: "./fonts/general-sans/general-sans-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/general-sans/general-sans-500.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/general-sans/general-sans-600.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/general-sans/general-sans-700.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-sans",
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
    <html lang="en" className={cn(sans.variable, mono.variable)}>
      <body className="min-h-dvh font-sans">
        <DesignVariantProvider>{children}</DesignVariantProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
