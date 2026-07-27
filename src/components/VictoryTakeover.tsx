"use client";

import { useEffect, useState } from "react";

import { PROJECTOR_LABELS, type ProjectorLocation } from "@/lib/types";

// FR-9.3: full-screen "circuits connecting, lights turning on" takeover -
// the second hero moment. Dark theatrical style by design (proposal §7).
export function VictoryTakeover({
  location,
  groupName,
}: {
  location: ProjectorLocation;
  groupName: string | null;
}) {
  const [lit, setLit] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLit(true), 2400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-night-900 px-6 text-center">
      {/* circuit lines drawing themselves */}
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 h-full w-full opacity-70"
        preserveAspectRatio="xMidYMid slice"
      >
        {[
          "M0,40 H60 V90 H100",
          "M200,20 H140 V70 H100",
          "M0,170 H50 V120 H100",
          "M200,180 H150 V130 H100",
          "M100,0 V50 M100,200 V150",
        ].map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={lit ? "var(--brand-2)" : "var(--brand-1)"}
            strokeWidth="1.2"
            strokeDasharray="1000"
            className="animate-circuit"
            style={{ animationDelay: `${i * 0.25}s` }}
          />
        ))}
        <circle
          cx="100"
          cy="100"
          r="14"
          fill={lit ? "var(--brand-2)" : "#1c1c38"}
          className={lit ? "animate-pulseglow" : ""}
        />
      </svg>

      <div className="relative z-10">
        {!lit ? (
          <p className="animate-pulseglow text-lg font-semibold text-brand-1">
            Connecting circuits…
          </p>
        ) : (
          <div className="animate-burst">
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-8 py-6 text-5xl font-display font-bold tracking-[-0.06em] text-amber-400 shadow-[0_0_60px_rgba(251,191,36,0.28)]">
              LIVE
            </div>
            <h1 className="mt-6 font-display text-3xl font-bold text-white">
              PROJECTOR REVIVED!
            </h1>
            <p className="mt-3 text-lg text-amber-400">
              {PROJECTOR_LABELS[location]}
            </p>
            {groupName && (
              <p className="mt-1 text-white/80">
                revived by <span className="font-bold">{groupName}</span>
              </p>
            )}
            <p className="mt-8 text-sm text-white/50">
              The lights return across campus
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
