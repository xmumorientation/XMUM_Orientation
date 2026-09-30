"use client";

import { useEffect, useState } from "react";

import "./vortexa.css";
import { SiteFooter } from "./SiteFooter";
import { SiteNav, StopRail } from "./SiteNav";
import { FONT, STOPS, type StopId } from "./data";
import { WelcomeSection } from "./sections/WelcomeSection";
import { OverviewSection } from "./sections/OverviewSection";
import { Games } from "./sections/Games";
import { Scoreboard } from "./sections/Scoreboard";
import { Schedule } from "./sections/Schedule";
import { Committees } from "./sections/Committees";
import { JoinSection } from "./sections/JoinSection";

/**
 * Public Orientation 2026 Welcome page — "Night Ticket".
 *
 * Seven full-screen "ride stops" (Welcome → Overview → Schedule → Games → … → Join) on a black ground, read one
 * at a time with scroll snapping. A single IntersectionObserver tracks the
 * current stop for the nav and the desktop dot rail, and marks each stop
 * `data-seen` the first time it enters view so its entrance animation plays
 * once. Scan / QR is gated behind login — not shown on this public page.
 * Mobile uses top bar + hamburger only (no bottom TabBar).
 */
export default function OrientationHome() {
  const [active, setActive] = useState<StopId>("welcome");

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
      <SiteNav active={active} />
      <StopRail active={active} />

      <main>
        <WelcomeSection />
        <OverviewSection />
        <Schedule />
        <Games />
        <Scoreboard />
        <Committees />
        <JoinSection />
      </main>
      <SiteFooter />
    </div>
  );
}
