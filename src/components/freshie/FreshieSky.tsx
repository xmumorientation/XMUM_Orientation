import type { CSSProperties } from "react";

import { GROUP_COUNT, groupSwatch } from "./groupTheme";

/**
 * Freshie Home background. Scrolls with the page: night sky with stars at the
 * Welcome stop, deeper sky in the middle, and a city with a ferris wheel at
 * the last stop.
 *
 * The night colours are the same for every group. The group colour is only
 * used as light on top (soft lights, horizon, windows, wheel rim, lamp bars),
 * through --fh-glow, --fh-glow-strength, --fh-glow-spread and --fh-partner.
 * The wheel has one cabin per group, in that group's colour; the viewer's
 * group gets a halo.
 *
 * Shapes come from a fixed seed, so server and client markup match.
 */

export type SkyCabin = { id: number; color: string | null };

function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

const STARS = (() => {
  const rnd = seeded(5);
  const out: { x: number; y: number; size: number; opacity: number }[] = [];
  while (out.length < 90) {
    const y = rnd() * 68;
    const fade = y / 68;
    if (rnd() < fade) continue;
    out.push({ x: r1(rnd() * 100), y: r1(y), size: rnd() < 0.08 ? 2 : 1, opacity: r1((1 - fade) * (0.3 + rnd() * 0.5)) });
  }
  return out;
})();

// Group lights scale with --fh-glow-spread and --fh-glow-strength; partner
// lights stay fixed. [width px, height px, horizontal position, top %, strength factor]
type Light = { w: number; h: number; x: string; top: number; k: number };
const GROUP_LIGHTS: Light[] = [
  { w: 620, h: 360, x: "center", top: -3, k: 0.95 },
  { w: 260, h: 260, x: "left", top: 14, k: 0.7 },
  { w: 280, h: 280, x: "right", top: 38, k: 0.55 },
  { w: 300, h: 300, x: "left", top: 66, k: 0.55 },
  { w: 560, h: 220, x: "center", top: 86, k: 0.85 },
];
const PARTNER_LIGHTS: Light[] = [
  { w: 240, h: 240, x: "right", top: 24, k: 0.18 },
  { w: 240, h: 240, x: "left", top: 52, k: 0.16 },
  { w: 260, h: 200, x: "right", top: 84, k: 0.2 },
];

function lightStyle(l: Light, group: boolean): CSSProperties {
  const w = group ? `calc(${l.w}px * var(--fh-glow-spread))` : `${l.w}px`;
  const h = group ? `calc(${l.h}px * var(--fh-glow-spread))` : `${l.h}px`;
  const pos: CSSProperties =
    l.x === "center"
      ? { left: "50%", transform: "translateX(-50%)" }
      : l.x === "left"
        ? { left: `calc(${w} * -0.45)` }
        : { right: `calc(${w} * -0.45)` };
  return {
    ...pos,
    top: `${l.top}%`,
    width: w,
    height: h,
    background: group ? "var(--fh-glow)" : "var(--fh-partner)",
    opacity: group ? `calc(var(--fh-glow-strength) * ${l.k})` : l.k,
  };
}

const SPARKS: { left: number; top: number; size: number; bg: string }[] = [
  { left: 10, top: 3.6, size: 16, bg: "#F2FF0B" },
  { left: 84, top: 2.6, size: 12, bg: "#0DFCFD" },
  { left: 88, top: 13, size: 20, bg: "linear-gradient(#FFB1C1, #FE06AB)" },
  { left: 7, top: 30, size: 14, bg: "var(--fh-partner)" },
  { left: 90, top: 47, size: 16, bg: "#F2FF0B" },
  { left: 8, top: 62, size: 14, bg: "#FE06AB" },
  { left: 86, top: 74, size: 18, bg: "var(--fh-partner)" },
];

// ── City (wide skyline, cropped to the screen) ───────────────────────────────
// Wide enough that big screens show more city instead of a zoomed-in one.
const CITY_W = 3200;
const CITY_H = 300;
const GROUND = 230;

function skyline(seed: number, minH: number, maxH: number, minW: number, maxW: number, lit: boolean) {
  const rnd = seeded(seed);
  const blocks: { x: number; y: number; w: number; h: number; roof: number }[] = [];
  const lights: { x: number; y: number; group: boolean; o: number }[] = [];
  let x = -4;
  while (x < CITY_W + 4) {
    const w = r1(minW + rnd() * (maxW - minW));
    const h = r1(minH + Math.pow(rnd(), 1.3) * (maxH - minH));
    const y = r1(GROUND - h);
    blocks.push({ x: r1(x), y, w, h: h + 80, roof: rnd() });
    if (lit) {
      for (let wy = y + 8; wy < GROUND - 6; wy += 10)
        for (let wx = x + 4; wx < x + w - 5; wx += 7)
          if (rnd() < 0.17) lights.push({ x: r1(wx), y: r1(wy), group: rnd() < 0.6, o: r1(0.35 + rnd() * 0.5) });
    }
    x += w + (rnd() < 0.3 ? 2 + rnd() * 6 : 0);
  }
  return { blocks, lights };
}

const FAR = skyline(3, 50, 150, 14, 34, false);
const NEAR = skyline(9, 30, 95, 22, 46, true);

function Buildings({ data, fill, opacity }: { data: ReturnType<typeof skyline>; fill: string; opacity: number }) {
  return (
    <g fill={fill} opacity={opacity}>
      {data.blocks.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} />
          {b.roof < 0.2 && <rect x={r1(b.x + b.w / 2 - 1)} y={r1(b.y - 18)} width={2} height={18} />}
          {b.roof >= 0.2 && b.roof < 0.32 && (
            <polygon points={`${b.x},${b.y} ${r1(b.x + b.w / 2)},${r1(b.y - 14)} ${r1(b.x + b.w)},${b.y}`} />
          )}
        </g>
      ))}
    </g>
  );
}

// ── Ferris wheel ─────────────────────────────────────────────────────────────
const WHEEL = { cx: 120, cy: 110, r: 86 };

function Wheel({ cabins, myGroupId }: { cabins: SkyCabin[]; myGroupId: number | null }) {
  const { cx, cy, r } = WHEEL;
  const n = cabins.length;
  return (
    <svg className="fh-sky-wheel" viewBox="0 0 240 300" aria-hidden>
      <line x1={cx} y1={cy} x2={cx - 60} y2={300} strokeOpacity=".6" strokeWidth="3" style={{ stroke: "var(--fh-blue-light)" }} />
      <line x1={cx} y1={cy} x2={cx + 60} y2={300} strokeOpacity=".6" strokeWidth="3" style={{ stroke: "var(--fh-blue-light)" }} />
      <circle cx={cx} cy={cy} r={r + 22} filter="url(#fh-sky-blur)" style={{ fill: "var(--fh-glow)", opacity: "calc(var(--fh-glow-strength) * 0.35)" }} />
      <g className="fh-sky-spin">
        <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth="2.6" filter="url(#fh-sky-glow)" style={{ stroke: "var(--fh-blue-light)" }} />
        <circle cx={cx} cy={cy} r={r - 14} fill="none" stroke="#E0B4FC" strokeOpacity=".5" strokeWidth="1" />
        {cabins.map((cab, i) => {
          const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
          const x = r1(cx + Math.cos(a) * r);
          const y = r1(cy + Math.sin(a) * r);
          const me = cab.id === myGroupId;
          const color = me ? "var(--fh-accent)" : groupSwatch(cab.id, cab.color);
          return (
            <g key={cab.id}>
              <line x1={cx} y1={cy} x2={x} y2={y} strokeOpacity=".45" strokeWidth="1" style={{ stroke: "var(--fh-blue-light)" }} />
              {/* Counter-rotates so the cabin keeps hanging down. */}
              <g className="fh-sky-cab">
                <line x1={x} y1={y} x2={x} y2={y + 6} stroke="#fff" strokeOpacity=".5" />
                {me && <circle className="fh-sky-halo" cx={x} cy={y + 13} r="15" opacity=".55" filter="url(#fh-sky-blur)" style={{ fill: color }} />}
                <rect
                  x={me ? x - 9 : x - 7}
                  y={y + 5}
                  width={me ? 18 : 14}
                  height={me ? 15 : 12}
                  rx="4"
                  style={{ fill: color }}
                  opacity={me ? 1 : 0.8}
                  stroke={me ? "#fff" : undefined}
                  strokeWidth={me ? 1.5 : undefined}
                />
              </g>
            </g>
          );
        })}
      </g>
      <circle cx={cx} cy={cy} r="7" fill="#fff" />
    </svg>
  );
}

function CityDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        <linearGradient id="fh-sky-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2c3480" />
          <stop offset="1" stopColor="#1d2160" />
        </linearGradient>
        <linearGradient id="fh-sky-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2a78" />
          <stop offset=".7" stopColor="#151443" />
          <stop offset="1" stopColor="#060a1a" />
        </linearGradient>
        <linearGradient id="fh-sky-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#030b1c" stopOpacity="0" />
          <stop offset=".6" stopColor="#030b1c" stopOpacity=".6" />
          <stop offset="1" stopColor="#030b1c" />
        </linearGradient>
        <linearGradient id="fh-sky-ribbon" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0DFCFD" stopOpacity=".3" />
          <stop offset=".4" stopColor="#E0B4FC" />
          <stop offset=".75" stopColor="#FE06AB" />
          <stop offset="1" stopColor="#FC9E3D" stopOpacity=".4" />
        </linearGradient>
        <linearGradient id="fh-sky-lamp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopOpacity="0" style={{ stopColor: "var(--fh-accent)" }} />
          <stop offset=".4" stopOpacity=".8" style={{ stopColor: "var(--fh-accent)" }} />
          <stop offset="1" stopOpacity=".1" style={{ stopColor: "var(--fh-accent)" }} />
        </linearGradient>
        <filter id="fh-sky-blur">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <filter id="fh-sky-glow" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}

export function FreshieSky({ cabins, myGroupId }: { cabins: SkyCabin[]; myGroupId: number | null }) {
  // Until the scoreboard loads, show one cabin per group in its fallback colour.
  const wheelCabins = cabins.length
    ? [...cabins].sort((a, b) => a.id - b.id)
    : Array.from({ length: GROUP_COUNT }, (_, i) => ({ id: i + 1, color: null }));

  return (
    <div className="fh-sky" aria-hidden>
      <CityDefs />
      <div className="fh-sky-dots" />

      {STARS.map((s, i) => (
        <i
          key={i}
          className="fh-sky-star"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, opacity: s.opacity }}
        />
      ))}

      {GROUP_LIGHTS.map((l, i) => (
        <div key={`g${i}`} className="fh-sky-light" style={lightStyle(l, true)} />
      ))}
      {PARTNER_LIGHTS.map((l, i) => (
        <div key={`p${i}`} className="fh-sky-light" style={lightStyle(l, false)} />
      ))}

      {SPARKS.map((s, i) => (
        <i
          key={i}
          className="fh-spark"
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, background: s.bg, animationDelay: `-${i * 0.6}s` }}
        />
      ))}

      <div className="fh-sky-city">
        <svg className="fh-sky-layer" viewBox={`0 0 ${CITY_W} ${CITY_H}`} preserveAspectRatio="xMidYMax slice">
          <Buildings data={FAR} fill="url(#fh-sky-far)" opacity={0.7} />
        </svg>
        <Wheel cabins={wheelCabins} myGroupId={myGroupId} />
        <svg className="fh-sky-layer" viewBox={`0 0 ${CITY_W} ${CITY_H}`} preserveAspectRatio="xMidYMax slice">
          <Buildings data={NEAR} fill="url(#fh-sky-near)" opacity={0.97} />
          {NEAR.lights.map((l, i) => (
            <rect key={i} x={l.x} y={l.y} width="2.6" height="4" opacity={l.o} style={{ fill: l.group ? "var(--fh-accent)" : "#ffe9b0" }} />
          ))}
          <rect x="0" y="150" width={CITY_W} height={CITY_H - 150} fill="url(#fh-sky-fade)" />
          <path
            d="M-20 296 C 600 240, 1120 228, 1600 252 S 2480 276, 3220 226"
            fill="none"
            stroke="url(#fh-sky-ribbon)"
            strokeWidth="10"
            strokeLinecap="round"
            opacity=".8"
            filter="url(#fh-sky-glow)"
          />
          {Array.from({ length: 62 }, (_, i) => (
            <rect
              key={i}
              className="fh-sky-lamp"
              x={14 + i * 52}
              y="266"
              width="14"
              height="34"
              fill="url(#fh-sky-lamp)"
              style={{ animationDelay: `${(i % 4) * 0.6}s` }}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
