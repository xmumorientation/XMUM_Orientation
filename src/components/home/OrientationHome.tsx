"use client";

import { useCallback, useEffect, useState } from "react";

import "./vortexa.css";
import { JoinChooser } from "./JoinChooser";
import { NightSkyline } from "./NightSkyline";
import { ScanPreview, SHOW_SCAN_PREVIEW } from "./ScanPreview";
import { SiteFooter } from "./SiteFooter";
import { SiteNav, StopRail, TabBar } from "./SiteNav";
import { FONT, STOPS, type StopId } from "./data";
import { WelcomeSection } from "./sections/WelcomeSection";
import { OverviewSection } from "./sections/OverviewSection";
import { Games } from "./sections/Games";
import { Scoreboard } from "./sections/Scoreboard";
import { Schedule } from "./sections/Schedule";
import { Committees } from "./sections/Committees";
import { JoinSection } from "./sections/JoinSection";

/**
 * Public Orientation 2026 homepage — "Night Ticket".
 *
 * Seven full-screen "ride stops" (Welcome → Join) over one continuous
 * background (NightSkyline: night sky → dusk → city), read one at a time with
 * scroll snapping. A single IntersectionObserver tracks the
 * current stop for the nav, the desktop dot rail and the mobile tab bar, and
 * marks each stop `data-seen` the first time it enters view so its entrance
 * animation plays once.
 */
export default function OrientationHome() {
  const [active, setActive] = useState<StopId>("welcome");
  // DEV PREVIEW scanner overlay — see ScanPreview.tsx.
  const [scanOpen, setScanOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const openScan = useCallback(() => setScanOpen(true), []);
  const closeScan = useCallback(() => setScanOpen(false), []);
  const openJoin = useCallback(() => setJoinOpen(true), []);
  const closeJoin = useCallback(() => setJoinOpen(false), []);
  const onScan = SHOW_SCAN_PREVIEW ? openScan : undefined;

  // Land at the top on reload rather than a restored mid-page position.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported = "scrollRestoration" in window.history;
    const previous = supported ? window.history.scrollRestoration : null;
    if (supported) window.history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    return () => {
      if (supported && previous) window.history.scrollRestoration = previous;
    };
  }, []);

  // Section-by-section snapping applies to this page only.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("vx-snap");
    return () => root.classList.remove("vx-snap");
  }, []);

  useEffect(() => {
    const els = STOPS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => !!el);

    const current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id as StopId);
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.setAttribute("data-seen", "");
            seen.unobserve(e.target);
          }
        }
      },
      { threshold: 0.25 }
    );

    els.forEach((el) => {
      current.observe(el);
      seen.observe(el);
    });
    return () => {
      current.disconnect();
      seen.disconnect();
    };
  }, []);

  return (
    <div className="vx nexus relative text-white" style={{ fontFamily: FONT.body }}>
      <SiteNav active={active} onScan={onScan} onJoin={openJoin} />
      <StopRail active={active} />

      <main className="vx-main">
        <NightSkyline />
        <WelcomeSection onJoin={openJoin} />
        <OverviewSection />
        <Games />
        <Scoreboard />
        <Schedule />
        <Committees />
        <JoinSection onJoin={openJoin} />
      </main>
      <SiteFooter />

      <TabBar active={active} onScan={onScan} />
      {SHOW_SCAN_PREVIEW && scanOpen && <ScanPreview onClose={closeScan} />}
      <JoinChooser open={joinOpen} onClose={closeJoin} />
    </div>
  );
}
