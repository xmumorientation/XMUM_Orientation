import { Glow, Spark } from "./decor";

/**
 * One continuous background behind all seven homepage stops.
 *
 * Top to bottom: near-black night with sparse stars (as the page looked
 * before), a sky that slowly turns indigo, and a city skyline with a ferris
 * wheel at the bottom of the Join stop. Positions are percentages of the whole
 * page, so the layer stretches with however tall the sections render.
 *
 * Everything is generated from a fixed seed, so server and client markup match.
 */

function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

type Star = { x: number; y: number; size: number; opacity: number; lilac: boolean };

function makeStars(): Star[] {
  const rnd = seeded(11);
  const stars: Star[] = [];
  while (stars.length < 140) {
    const y = rnd() * 70; // % of page height; none below the dusk
    const fade = y / 70;
    if (rnd() < fade) continue; // thinner the further down
    stars.push({
      x: r1(rnd() * 100),
      y: r1(y),
      size: rnd() < 0.08 ? 2 : 1,
      opacity: r1((1 - fade) * (0.3 + rnd() * 0.5)),
      lilac: rnd() < 0.15,
    });
  }
  return stars;
}

const STARS = makeStars();

/** Brand sparkles spread down the page: [left %, top %, size px, colour]. */
const SPARKS: [number, number, number, string][] = [
  [16, 3.4, 26, "var(--vx-yellow)"],
  [80, 2.8, 16, "var(--vx-cyan)"],
  [86, 10.6, 32, "linear-gradient(#FFB1C1, #FE06AB)"],
  [93, 17, 20, "var(--vx-lilac)"],
  [6, 34, 22, "var(--vx-cyan)"],
  [92, 46, 18, "var(--vx-orange)"],
  [8, 61, 20, "var(--vx-pink)"],
  [90, 71, 24, "var(--vx-yellow)"],
  [12, 80, 22, "var(--vx-cyan)"],
];

/** Small glowing orbs over the dusk part, as in the recruitment poster. */
const ORBS: [number, number, number, string][] = [
  [6, 67, 12, "#F2FF0B"],
  [94, 74, 16, "#FC9E3D"],
  [4, 86, 12, "#FE06AB"],
  [96, 84, 10, "#0DFCFD"],
];

// ── City (SVG units) ─────────────────────────────────────────────────────────
// Twice as wide as a typical desktop: wide screens show more city instead of a
// zoomed-in, top-cropped one. Narrow screens see the middle.
const VB_W = 3200;
const VB_H = 760;
const GROUND = 560;

function skyline(seed: number, minH: number, maxH: number, minW: number, maxW: number, windows: boolean) {
  const rnd = seeded(seed);
  const blocks: { x: number; y: number; w: number; h: number; roof: number }[] = [];
  const lights: { x: number; y: number; warm: boolean; o: number }[] = [];
  let x = -10;
  while (x < VB_W + 10) {
    const w = r1(minW + rnd() * (maxW - minW));
    const h = r1(minH + Math.pow(rnd(), 1.4) * (maxH - minH));
    const y = r1(GROUND - h);
    blocks.push({ x: r1(x), y, w, h: h + 220, roof: rnd() });
    if (windows) {
      for (let wy = y + 12; wy < GROUND - 10; wy += 16)
        for (let wx = x + 6; wx < x + w - 8; wx += 11)
          if (rnd() < 0.16) lights.push({ x: r1(wx), y: r1(wy), warm: rnd() > 0.7, o: r1(0.25 + rnd() * 0.45) });
    }
    x += w + (rnd() < 0.3 ? 4 + rnd() * 14 : 0);
  }
  return { blocks, lights };
}

const FAR = skyline(3, 140, 400, 26, 70, false);
const NEAR = skyline(7, 80, 250, 40, 96, true);

// The wheel is its own SVG (0 0 600 600), placed by CSS so it is always fully
// on screen; the wide city layers around it may be cropped at the sides.
const WHEEL = { cx: 300, cy: 300, r: 245, spokes: 22 };
const WHEEL_ENDS = Array.from({ length: WHEEL.spokes }, (_, i) => {
  const a = (i / WHEEL.spokes) * Math.PI * 2;
  return { x: r1(WHEEL.cx + Math.cos(a) * WHEEL.r), y: r1(WHEEL.cy + Math.sin(a) * WHEEL.r) };
});

function Buildings({ data, fill, opacity }: { data: ReturnType<typeof skyline>; fill: string; opacity: number }) {
  return (
    <g fill={fill} opacity={opacity}>
      {data.blocks.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} />
          {b.roof < 0.18 && <rect x={r1(b.x + b.w / 2 - 1.5)} y={b.y - 34} width={3} height={34} />}
          {b.roof >= 0.18 && b.roof < 0.3 && (
            <polygon points={`${b.x},${b.y} ${r1(b.x + b.w / 2)},${r1(b.y - 26)} ${r1(b.x + b.w)},${b.y}`} />
          )}
          {b.roof >= 0.3 && b.roof < 0.42 && <rect x={r1(b.x + b.w * 0.2)} y={r1(b.y - 18)} width={r1(b.w * 0.6)} height={18} />}
        </g>
      ))}
    </g>
  );
}

function CityDefs() {
  return (
    <defs>
      <linearGradient id="vx-city-far" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3b3fb8" />
        <stop offset="1" stopColor="#2a2c86" />
      </linearGradient>
      <linearGradient id="vx-city-near" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4a3aa0" />
        <stop offset=".6" stopColor="#2a1f66" />
        <stop offset="1" stopColor="#0b0820" />
      </linearGradient>
      <linearGradient id="vx-city-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#07060b" stopOpacity="0" />
        <stop offset=".55" stopColor="#07060b" stopOpacity=".55" />
        <stop offset="1" stopColor="#07060b" />
      </linearGradient>
      <linearGradient id="vx-city-ribbon" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#E0B4FC" stopOpacity=".2" />
        <stop offset=".45" stopColor="#E0B4FC" />
        <stop offset=".75" stopColor="#FFB1C1" />
        <stop offset="1" stopColor="#E0B4FC" stopOpacity=".3" />
      </linearGradient>
      <linearGradient id="vx-city-lamp" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FE06AB" stopOpacity="0" />
        <stop offset=".35" stopColor="#b44dff" stopOpacity=".9" />
        <stop offset="1" stopColor="#5a2fb0" stopOpacity=".2" />
      </linearGradient>
      <filter id="vx-city-soft">
        <feGaussianBlur stdDeviation="1.6" />
      </filter>
      <filter id="vx-city-haze">
        <feGaussianBlur stdDeviation="22" />
      </filter>
      <filter id="vx-city-glow" x="-20%" y="-50%" width="140%" height="200%">
        <feGaussianBlur stdDeviation="5" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

/** Ghosted ferris wheel. Its legs end 40 units below the city's ground line. */
function Wheel() {
  const { cx, cy, r } = WHEEL;
  return (
    <svg className="vx-wheel" viewBox="0 0 600 600" aria-hidden>
      <g filter="url(#vx-city-soft)" opacity=".55">
        <line x1={cx} y1={cy} x2={cx - 120} y2={600} stroke="#E0B4FC" strokeWidth="6" />
        <line x1={cx} y1={cy} x2={cx + 120} y2={600} stroke="#E0B4FC" strokeWidth="6" />
        <g className="vx-city-wheel">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3E6FF" strokeWidth="5" />
          <circle cx={cx} cy={cy} r={r - 26} fill="none" stroke="#E0B4FC" strokeWidth="2" />
          {WHEEL_ENDS.map((p, i) => (
            <g key={i}>
              <line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#E0B4FC" strokeWidth="1.6" />
              <circle cx={p.x} cy={p.y} r="9" fill="#E0B4FC" opacity=".9" />
            </g>
          ))}
        </g>
        <circle cx={cx} cy={cy} r="14" fill="#fff" />
      </g>
    </svg>
  );
}

/** Far skyline, then the wheel, then the near skyline on top. */
function City() {
  const box = `0 0 ${VB_W} ${VB_H}`;
  return (
    <div className="vx-city" aria-hidden>
      <svg className="vx-city-layer" viewBox={box} preserveAspectRatio="xMidYMax slice">
        <CityDefs />
        <ellipse cx="1600" cy="520" rx="1800" ry="140" fill="#6a4ae0" opacity=".35" filter="url(#vx-city-haze)" />
        <Buildings data={FAR} fill="url(#vx-city-far)" opacity={0.55} />

        {/* Bridge, left of centre */}
        <g opacity=".6" stroke="#8f9cff" fill="none" strokeWidth="2.5" transform="translate(-380 0)">
          <path d="M1380 470 L1430 410 L1480 470 M1480 470 L1530 410 L1580 470" />
          <line x1="1360" y1="470" x2="1620" y2="470" strokeWidth="4" />
          <path d="M1430 410 L1405 470 M1430 410 L1455 470 M1530 410 L1505 470 M1530 410 L1555 470" strokeWidth="1.2" />
        </g>
      </svg>

      <Wheel />

      <svg className="vx-city-layer" viewBox={box} preserveAspectRatio="xMidYMax slice">
        <Buildings data={NEAR} fill="url(#vx-city-near)" opacity={0.95} />
        <g>
          {NEAR.lights.map((l, i) => (
            <rect key={i} x={l.x} y={l.y} width="4" height="6" fill={l.warm ? "#F2FF0B" : "#c9b8ff"} opacity={l.o} />
          ))}
        </g>

        {/* Fade the city into the footer's black */}
        <rect x="0" y="420" width={VB_W} height={VB_H - 420} fill="url(#vx-city-fade)" />

        {/* Coaster ribbon */}
        <path
          d="M-40 740 C 700 600, 1420 560, 1700 620 S 2500 700, 3240 560"
          fill="none"
          stroke="url(#vx-city-ribbon)"
          strokeWidth="26"
          strokeLinecap="round"
          opacity=".75"
          filter="url(#vx-city-glow)"
        />

        {/* Neon lamp bars */}
        <g filter="url(#vx-city-glow)">
          {Array.from({ length: 23 }, (_, i) => (
            <rect
              key={i}
              className="vx-city-lamp"
              x={40 + i * 140}
              y="650"
              width="34"
              height="110"
              fill="url(#vx-city-lamp)"
              style={{ animationDelay: `${(i % 4) * 0.6}s` }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

export function NightSkyline() {
  return (
    <div className="vx-world" aria-hidden>
      <div className="vx-world-dots" />

      {STARS.map((s, i) => (
        <i
          key={i}
          className="vx-star"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
            background: s.lilac ? "var(--vx-lilac)" : "#fff",
          }}
        />
      ))}

      {/* Soft side glows: the navy/pink pair from the old Welcome, then drifting down the page */}
      <Glow size="min(620px, 90vw)" color="var(--vx-navy)" style={{ left: "-14%", top: "1%", opacity: 0.85 }} />
      <Glow size="min(440px, 70vw)" color="var(--vx-pink)" style={{ right: "-8%", top: "10%" }} />
      <Glow size="min(520px, 80vw)" color="var(--vx-navy)" style={{ right: "-12%", top: "22%", opacity: 0.6 }} />
      <Glow size="min(420px, 70vw)" color="var(--vx-cyan)" style={{ left: "-10%", top: "34%", opacity: 0.12 }} />
      <Glow size="min(520px, 80vw)" color="#5a2fb0" style={{ right: "-12%", top: "47%" }} />
      <Glow size="min(560px, 80vw)" color="var(--vx-pink)" style={{ left: "-14%", top: "60%", opacity: 0.18 }} />
      <Glow size="min(900px, 120vw)" color="#5a3fd0" style={{ left: "20%", top: "76%", opacity: 0.28 }} />

      {SPARKS.map(([left, top, size, color], i) => (
        <Spark key={i} size={size} color={color} style={{ left: `${left}%`, top: `${top}%` }} />
      ))}
      {ORBS.map(([left, top, size, color], i) => (
        <i
          key={i}
          className="vx-orb"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            width: size,
            height: size,
            background: `radial-gradient(circle at 35% 30%, #fff, ${color} 55%, transparent 75%)`,
            boxShadow: `0 0 18px ${color}`,
            animationDelay: `${i * 0.8}s`,
          }}
        />
      ))}

      <City />
    </div>
  );
}
