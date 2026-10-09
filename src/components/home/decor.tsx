"use client";

import type { CSSProperties } from "react";

import { countdownParts, useEventCountdown } from "@/components/useEventCountdown";

import { FONT } from "./data";

export function StarSparkle({
  size = 20,
  color = "#fff",
  style = {},
}: {
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" style={style} aria-hidden>
      <path d="M20 2 L22 18 L38 20 L22 22 L20 38 L18 22 L2 20 L18 18 Z" fill={color} />
    </svg>
  );
}

export function Blob({ color, style = {} }: { color: string; style?: CSSProperties }) {
  return (
    <div
      className="blob-float pointer-events-none select-none"
      aria-hidden
      style={{
        position: "absolute",
        borderRadius: "60% 40% 70% 30% / 50% 60% 40% 70%",
        background: color,
        filter: "blur(48px)",
        opacity: 0.18,
        ...style,
      }}
    />
  );
}

export function HoloSticker({
  emoji,
  label,
  deg = 0,
  style = {},
}: {
  emoji: string;
  label?: string;
  deg?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      className="pointer-events-none select-none"
      aria-hidden
      style={{
        position: "absolute",
        transform: `rotate(${deg}deg)`,
        background: "linear-gradient(135deg,#ff3cac22,#00cfff22,#39ff1422)",
        border: "1.5px solid rgba(255,255,255,0.15)",
        borderRadius: "50%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(4px)",
        ...style,
      }}
    >
      <span style={{ fontSize: typeof style.width === "number" ? style.width * 0.4 : 28 }}>{emoji}</span>
      {label && <span style={{ fontSize: 9, color: "#fff", fontFamily: FONT.mono, marginTop: 2 }}>{label}</span>}
    </div>
  );
}

export function MarqueeBanner() {
  const items = [
    "VORTEXA",
    "XMUM 26/12 Orientation",
    "★ ONE TICKET, ONE RIDE ★",
    "28–29 NOV 2026",
    "2 DAYS",
    "TEAMS TBA",
    "10 COMMITTEES",
    "★ DISCOVER ADVENTURE INSIDE ★",
  ];
  const doubled = [...items, ...items];
  return (
    <div
      style={{
        overflow: "hidden",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        padding: "10px 0",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div className="marquee-track" style={{ display: "flex", gap: 40, whiteSpace: "nowrap", width: "max-content" }}>
        {doubled.map((t, i) => (
          <span
            key={i}
            className="text-holo"
            style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 13, letterSpacing: 2, textTransform: "uppercase" }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Four-point sticker star from the brand style reference. Decorative only. */
export function Spark({ size, color, style = {} }: { size: number; color: string; style?: CSSProperties }) {
  return <i className="vx-spark" aria-hidden style={{ width: size, height: size, background: color, ...style }} />;
}

/** Soft colour glow placed behind a section's content. Decorative only. */
export function Glow({ size, color, style = {} }: { size: number | string; color: string; style?: CSSProperties }) {
  return <div className="vx-glow" aria-hidden style={{ width: size, height: size, background: color, ...style }} />;
}

/** Event countdown: D-day, then the live game phase. See useEventCountdown. */
export function Countdown() {
  const { label, seconds, paused } = useEventCountdown();
  const t = countdownParts(seconds);

  const pad = (n: number) => String(n).padStart(2, "0");
  const units = [
    { label: "DAYS", val: t?.d },
    { label: "HRS", val: t?.h },
    { label: "MIN", val: t?.m },
    { label: "SEC", val: t?.s },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div className="vx-count-label vx-mono">{label}</div>
    <div className="vx-count" role="timer" aria-label={label.toLowerCase()} aria-atomic="true" aria-live="off" data-paused={paused || undefined}>
      {units.map((u, i) => (
        <div key={u.label} className="vx-count-cell vx-ticket">
          <b className="vx-num" style={{ color: i === 0 ? "var(--vx-cyan)" : "#fff" }}>
            {u.val === undefined ? "--" : pad(u.val)}
          </b>
          <span className="vx-mono">{u.label}</span>
        </div>
      ))}
    </div>
    </div>
  );
}
