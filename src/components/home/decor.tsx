"use client";

import { useEffect, useState, type CSSProperties } from "react";
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
  const items = ["NEXUS '26", "ORIENTATION 2026", "★ GAME ON ★", "3 DAYS", "6 TEAMS", "1,240 STUDENTS", "★ LET'S GO ★"];
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

export function Countdown() {
  const calc = () => {
    const diff = new Date("2026-09-18T08:00:00").getTime() - Date.now();
    if (diff <= 0) return { d: 0, h: 0, m: 0, s: 0 };
    return {
      d: Math.floor(diff / 86400000),
      h: Math.floor((diff % 86400000) / 3600000),
      m: Math.floor((diff % 3600000) / 60000),
      s: Math.floor((diff % 60000) / 1000),
    };
  };
  // Start null to keep SSR/CSR markup identical, then hydrate on the client.
  const [t, setT] = useState<ReturnType<typeof calc> | null>(null);
  useEffect(() => {
    setT(calc());
    const i = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(i);
  }, []);

  const pad = (n: number) => String(n).padStart(2, "0");
  const units = [
    { label: "DAYS", val: t?.d, color: "#ff3cac" },
    { label: "HRS", val: t?.h, color: "#d966ff" },
    { label: "MIN", val: t?.m, color: "#00cfff" },
    { label: "SEC", val: t?.s, color: "#39ff14" },
  ];

  return (
    <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
      {units.map((u) => (
        <div key={u.label} style={{ textAlign: "center" }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              fontWeight: 900,
              fontFamily: FONT.mono,
              color: u.color,
              background: `${u.color}12`,
              border: `2px solid ${u.color}40`,
              boxShadow: `0 0 20px ${u.color}30`,
            }}
          >
            {u.val === undefined ? "--" : pad(u.val)}
          </div>
          <div style={{ fontSize: 10, marginTop: 6, color: "rgba(255,255,255,0.4)", fontFamily: FONT.mono, letterSpacing: 2 }}>
            {u.label}
          </div>
        </div>
      ))}
    </div>
  );
}
