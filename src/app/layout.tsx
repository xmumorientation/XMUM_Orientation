import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "./globals.css";
import { DesignVariantProvider } from "@/components/DesignVariantProvider";
import { cn } from "@/lib/utils";

// Self-hosted at build time — no runtime dependency on a font CDN, which
// matters on flaky venue wifi during the live event. Archivo is a variable
// font (wght 100–900), so one file covers every weight the Modernist
// language uses (400 body / 600 emphasis / 800 display).
const sans = localFont({
  src: [
    {
      path: "./fonts/archivo/archivo-variable-latin.woff2",
      weight: "100 900",
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
  themeColor: "#f3f2f2",
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
