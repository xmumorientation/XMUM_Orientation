"use client";

import { scrollToSection } from "../data";
import { Glow, Spark } from "../decor";

export function WelcomeSection() {
  return (
    <section id="welcome" className="vx-sec vx-welcome" aria-labelledby="welcome-title">
      <div className="vx-dots" />
      <Glow size="min(520px, 90vw)" color="var(--vx-navy)" style={{ left: "-8%", top: "12%", opacity: 0.45 }} />
      <Glow size="min(380px, 70vw)" color="var(--vx-pink)" style={{ right: "-4%", bottom: "-6%", opacity: 0.28 }} />
      <Spark size={18} color="var(--vx-yellow)" style={{ left: "16%", top: "24%", opacity: 0.55 }} />
      <Spark size={14} color="var(--vx-cyan)" style={{ right: "18%", top: "22%", opacity: 0.45 }} />

      <div className="vx-inner">
        <div className="vx-eyebrow vx-rise">XMUM 26/12 Orientation</div>

        <h1 id="welcome-title" className="vx-rise" style={{ margin: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <span className="vx-welcome-pre">WELCOME TO</span>
          <span className="vx-welcome-mark vx-holo">Vortexa</span>
        </h1>

        <p className="vx-welcome-slogan vx-rise-2">One ticket, one ride. Discover the adventure inside.</p>

        <p className="vx-lead vx-rise-2">
          Vortexa is the official theme of XMUM Orientation 2026 — a neon carnival where new beginnings take flight. Over two
          days, discover campus, bond with your team, and step into university life with energy and purpose.
        </p>

        <div className="vx-welcome-actions vx-rise-3">
          <button type="button" className="vx-btn vx-btn-primary" onClick={() => scrollToSection("check-in")}>
            How to check in
          </button>
          <button type="button" className="vx-btn vx-btn-ghost" onClick={() => scrollToSection("overview")}>
            What&apos;s inside ↓
          </button>
        </div>

        <div className="vx-welcome-strip vx-mono vx-rise-3">
          <span><b>28–29 NOV</b>2026</span>
          <span><b>2 DAYS</b>on campus</span>
          <span><b>XMUM</b>Sepang, Selangor</span>
        </div>
      </div>

      <button type="button" className="vx-scrollhint vx-mono" onClick={() => scrollToSection("overview")}>
        SCROLL · NEXT STOP: OVERVIEW
      </button>
    </section>
  );
}
