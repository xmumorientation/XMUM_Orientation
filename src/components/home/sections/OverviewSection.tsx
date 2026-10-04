"use client";

import { Countdown } from "../decor";

const STATS = [
  { value: "28–29 Nov", label: "Main D-Day", color: "var(--vx-cyan)" },
  { value: "2 Days", label: "Full program", color: "var(--vx-orange)" },
  { value: "TBA", label: "Orientation teams", color: "var(--vx-pink)" },
  { value: "10", label: "Committees", color: "var(--vx-lilac)" },
];

export function OverviewSection() {
  return (
    <section id="overview" className="vx-sec vx-overview" aria-labelledby="overview-title">
      <div className="vx-inner">
        <div className="vx-overview-copy">
          <h2 id="overview-title" className="vx-h2 vx-rise">Overview</h2>
          <p className="vx-lead vx-rise">
            XMUM Orientation 2026 brings together freshies, facilitators, and game masters across campus for two days of
            shared challenges and discovery.
          </p>
          <div className="vx-rise-2" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="vx-count-label vx-mono">ORIENTATION BEGINS IN</div>
            <Countdown />
          </div>
        </div>

        <ul className="vx-stats vx-rise-3" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {STATS.map((s) => (
            <li key={s.label} className="vx-card vx-stat">
              <b className="vx-num" style={{ color: s.color }}>{s.value}</b>
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
