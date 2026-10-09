"use client";

import { useId } from "react";

import { PIECES_PER_SET, type ProjectorLocation } from "@/lib/types";

// One location's puzzle drawn as a round key head cut into 5 slices, one per
// piece. Owned slices show the art; missing ones are a dark outline. With all
// 5 in, a blade can be drawn under it so it reads as a whole key.
//   B1 Star Key: a star lantern, one point per piece
//   A3 Wheel Key: a ferris wheel, one cabin per piece
//   TF Orbit Key: a circling track, one arrow per piece
// Each location keeps fixed colours so every group sees the same key.

export type KeyMode = "normal" | "lit" | "idle";

export const KEY_NAMES: Record<ProjectorLocation, string> = {
  B1: "Star Key",
  A3: "Wheel Key",
  TF: "Orbit Key",
};

const KEY_COLORS: Record<ProjectorLocation, { main: string; light: string; stops: [string, string, string] }> = {
  B1: { main: "#ff4fc3", light: "#fff0fb", stops: ["#ff7fd6", "#b02fbf", "#4a1580"] },
  A3: { main: "#ffd66b", light: "#fff7d6", stops: ["#2f7fd0", "#0b3f7a", "#06224a"] },
  TF: { main: "#fc9e3d", light: "#fff1e2", stops: ["#ff9a5c", "#a0326e", "#4a1660"] },
};

const GOLD = "#ffd66b";
const MUTE = "#4d6a94";
const LINE = "#22457a";
const C = 50;
const R = 44;
const SPAN = 360 / PIECES_PER_SET;
const PIECES = Array.from({ length: PIECES_PER_SET }, (_, i) => i);

function pt(deg: number, r: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [+(C + r * Math.cos(a)).toFixed(2), +(C + r * Math.sin(a)).toFixed(2)];
}

function wedge(i: number): string {
  const [x0, y0] = pt(i * SPAN, R + 6);
  const [x1, y1] = pt((i + 1) * SPAN, R + 6);
  return `M${C} ${C} L${x0} ${y0} A${R + 6} ${R + 6} 0 0 1 ${x1} ${y1} Z`;
}

const mid = (i: number) => i * SPAN + SPAN / 2;

function StarArt({ fill }: { fill: string }) {
  const points = Array.from({ length: 10 }, (_, k) => pt(k * 36, k % 2 ? 17 : 38).join(",")).join(" ");
  return (
    <>
      <circle cx={C} cy={C} r={R} fill={fill} />
      <circle cx={C} cy={C} r={R - 5} fill="none" stroke="#ffd1f1" strokeOpacity={0.5} strokeWidth={1} strokeDasharray="1.5 3" />
      <polygon points={points} fill="#fff0fb" stroke="#ff4fc3" strokeWidth={1.5} strokeLinejoin="round" />
      {PIECES.map((i) => {
        const [x, y] = pt(mid(i) - 36, 33);
        return <circle key={i} cx={x} cy={y} r={1.8} fill="#fff" />;
      })}
    </>
  );
}

function WheelArt({ fill }: { fill: string }) {
  return (
    <>
      <circle cx={C} cy={C} r={R} fill={fill} />
      <circle cx={C} cy={C} r={31} fill="none" stroke="#9fd0ff" strokeWidth={2.5} />
      <circle cx={C} cy={C} r={23} fill="none" stroke="#9fd0ff" strokeOpacity={0.45} strokeWidth={1} />
      {PIECES.map((i) => {
        const [sx, sy] = pt(mid(i), 31);
        const [cx, cy] = pt(mid(i), 36);
        const [lx, ly] = pt(mid(i) + 36, 31);
        return (
          <g key={i}>
            <line x1={C} y1={C} x2={sx} y2={sy} stroke="#9fd0ff" strokeOpacity={0.7} strokeWidth={1.4} />
            <rect x={cx - 4.5} y={cy - 3.5} width={9} height={8} rx={2.5} fill="#ffd66b" stroke="#fff7d6" strokeWidth={1} />
            <circle cx={lx} cy={ly} r={1.6} fill="#fff7d6" />
          </g>
        );
      })}
    </>
  );
}

function TrackArt({ fill }: { fill: string }) {
  return (
    <>
      <circle cx={C} cy={C} r={R} fill={fill} />
      <circle cx={C} cy={C} r={38} fill="none" stroke="#ffc79a" strokeOpacity={0.7} strokeWidth={1.2} strokeDasharray="3 3" />
      <circle cx={C} cy={C} r={31} fill="none" stroke="#fff1e2" strokeWidth={2.2} />
      <circle cx={C} cy={C} r={24} fill="none" stroke="#ffc79a" strokeOpacity={0.7} strokeWidth={1.2} strokeDasharray="3 3" />
      {PIECES.map((i) => {
        const tip = pt(mid(i), 31);
        const a = pt(mid(i) - 7, 35);
        const b = pt(mid(i) - 7, 27);
        return (
          <polygon
            key={i}
            points={`${tip.join(",")} ${a.join(",")} ${b.join(",")}`}
            fill="#fc9e3d"
            stroke="#fff1e2"
            strokeWidth={1}
            strokeLinejoin="round"
          />
        );
      })}
    </>
  );
}

const ART: Record<ProjectorLocation, (props: { fill: string }) => React.ReactElement> = {
  B1: StarArt,
  A3: WheelArt,
  TF: TrackArt,
};

export function KeyEmblem({
  loc,
  owned,
  mode = "normal",
  blade = false,
  fresh = null,
  celebrate = false,
  className,
}: {
  loc: ProjectorLocation;
  /** Piece numbers 1–5 the group owns. */
  owned: number[];
  mode?: KeyMode;
  /** Draw the key blade under the head (use when all 5 are in). */
  blade?: boolean;
  /** A piece that just arrived: its slice pops in. */
  fresh?: number | null;
  /** The set was just completed: play the completion effect. */
  celebrate?: boolean;
  className?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const colors = KEY_COLORS[loc];
  const Art = ART[loc];
  const complete = owned.length >= PIECES_PER_SET;
  const grey = mode === "idle";
  const gold = mode === "lit";
  const rim = gold ? GOLD : complete && !grey ? colors.main : LINE;
  const hole = gold ? GOLD : complete && !grey ? colors.light : MUTE;
  const bladeColor = gold ? GOLD : grey ? MUTE : colors.main;

  return (
    <svg
      className={[className, celebrate ? "fi-celebrate" : ""].filter(Boolean).join(" ")}
      viewBox={blade ? "0 0 100 150" : "0 0 100 100"}
      role="img"
      aria-label={`${KEY_NAMES[loc]}: ${owned.length} of ${PIECES_PER_SET} pieces`}
      data-mode={mode}
      data-complete={complete}
      style={{ "--fi-key": gold ? GOLD : colors.main } as React.CSSProperties}
    >
      <defs>
        <radialGradient id={`g${id}`} cx="50%" cy="40%" r="65%">
          <stop offset="0" stopColor={colors.stops[0]} />
          <stop offset="0.65" stopColor={colors.stops[1]} />
          <stop offset="1" stopColor={colors.stops[2]} />
        </radialGradient>
        {PIECES.map((i) => (
          <clipPath key={i} id={`w${id}-${i}`}>
            <path d={wedge(i)} />
          </clipPath>
        ))}
        <clipPath id={`c${id}`}>
          <circle cx={C} cy={C} r={R} />
        </clipPath>
        <filter id={`grey${id}`}>
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>

      {blade && (
        <g fill={bladeColor} filter={grey ? `url(#grey${id})` : undefined}>
          <rect x={45} y={92} width={10} height={50} rx={3} />
          <rect x={55} y={118} width={11} height={7} rx={1.5} />
          <rect x={55} y={130} width={8} height={7} rx={1.5} />
          <rect x={45} y={92} width={3} height={50} fill="#fff" opacity={0.35} />
        </g>
      )}

      <circle cx={C} cy={C} r={R + 4} fill="#071a38" stroke={rim} strokeWidth={2} />

      {PIECES.map((i) => {
        const have = owned.includes(i + 1);
        return (
          <g key={i}>
            <g
              className={`fi-slice${fresh === i + 1 ? " fi-slice-new" : ""}`}
              style={{ "--i": i } as React.CSSProperties}
              clipPath={`url(#w${id}-${i})`}
              opacity={have ? 1 : 0.13}
              filter={have && grey ? `url(#grey${id})` : undefined}
            >
              <Art fill={`url(#g${id})`} />
            </g>
            {!have && (
              <path d={wedge(i)} fill="none" stroke={LINE} strokeWidth={1} strokeDasharray="2 2.5" clipPath={`url(#c${id})`} />
            )}
          </g>
        );
      })}

      {PIECES.map((i) => {
        const [x, y] = pt(i * SPAN, R);
        return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="#030b1c" strokeWidth={2} />;
      })}

      {celebrate && (
        <g className="fi-burst" aria-hidden>
          <circle cx={C} cy={C} r={R + 4} fill="none" stroke={colors.main} strokeWidth={3} />
          {Array.from({ length: 8 }, (_, k) => {
            const [x, y] = pt(k * 45 + 22.5, R + 10);
            return (
              <path
                key={k}
                className="fi-spark"
                style={{ "--dx": `${(x - C) * 0.35}px`, "--dy": `${(y - C) * 0.35}px` } as React.CSSProperties}
                d={`M${x} ${y - 4} L${x + 1.2} ${y - 1.2} L${x + 4} ${y} L${x + 1.2} ${y + 1.2} L${x} ${y + 4} L${x - 1.2} ${y + 1.2} L${x - 4} ${y} L${x - 1.2} ${y - 1.2} Z`}
                fill={k % 2 ? colors.light : colors.main}
              />
            );
          })}
        </g>
      )}

      <circle cx={C} cy={C} r={9.5} fill="#030b1c" stroke={gold ? GOLD : LINE} strokeWidth={1.5} />
      <circle cx={C} cy={48} r={3.3} fill={hole} />
      <path d="M48.4 49.5 L51.6 49.5 L52.6 55 L47.4 55 Z" fill={hole} />
    </svg>
  );
}
