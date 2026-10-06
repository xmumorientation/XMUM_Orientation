import { Glow, Spark } from "./decor";

/**
 * One continuous background behind all seven homepage stops.
 *
 * Top to bottom: near-black night with sparse stars (as the page looked
 * before), a sky that slowly turns indigo, and a city skyline with a ferris
 * wheel at the bottom of the last stop. Positions are percentages of the whole
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
  while (stars.length < 150) {
    const y = rnd() * 62; // Space thins into the lower sky; none near the park
    const fade = y / 62;
    if (rnd() < fade) continue; // thinner the further down
    stars.push({
      x: r1(rnd() * 100),
      y: r1(y),
      size: rnd() < 0.18 ? 2 : 1,
      opacity: r1((1 - fade) * (0.45 + rnd() * 0.5)),
      lilac: rnd() < 0.1,
    });
  }
  return stars;
}

const STARS = makeStars();

/** Brand sparkles spread down the page: [left %, top %, size px, colour]. */
const SPARKS: [number, number, number, string][] = [
  [7, 3.4, 26, "var(--vx-yellow)"],
  [80, 2.8, 16, "var(--vx-cyan)"],
  [86, 10.6, 32, "linear-gradient(#FFB1C1, #FE06AB)"],
  [93, 17, 20, "var(--vx-lilac)"],
  [92, 46, 18, "var(--vx-orange)"],
  [8, 58, 20, "var(--vx-pink)"],
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

        {/* Park booths, flags and path lights replace celestial decoration at ground level. */}
        <g opacity=".8">
          <g transform="translate(1170 450)">
            <path d="M0 70 L70 0 L140 70Z" fill="#FE06AB" />
            <path d="M35 70 L70 0 L105 70Z" fill="#E0B4FC" />
            <rect x="15" y="70" width="110" height="80" fill="#221844" />
            <path d="M55 150 V94 Q70 78 85 94 V150" fill="#FC9E3D" opacity=".6" />
            <path d="M70 0 V-40 L104 -27 L70 -15" fill="#0DFCFD" stroke="#E0B4FC" strokeWidth="2" />
          </g>
          <g transform="translate(1870 480)">
            <rect x="0" y="20" width="90" height="105" rx="5" fill="#221844" stroke="#E0B4FC" strokeWidth="2" />
            <path d="M-10 20 L12 0 H78 L100 20Z" fill="#FC9E3D" />
            <rect x="18" y="39" width="54" height="36" rx="3" fill="#0DFCFD" opacity=".5" />
            <path d="M12 25 H78" stroke="#FFB1C1" strokeWidth="6" strokeDasharray="10 8" />
          </g>
          {[1370, 1790].map(x => <g key={x}><path d={`M${x} 585 V490`} stroke="#E0B4FC" strokeWidth="3" /><circle cx={x} cy="480" r="12" fill="#F2FF0B" opacity=".7" /></g>)}
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

function SkyJourney() {
  return <>
    <svg className="vx-planet vx-planet-a" viewBox="0 0 120 90" focusable="false">
      <circle cx="60" cy="45" r="27" fill="#E0B4FC" opacity=".8" />
      <path d="M37 32 Q57 26 83 41 M35 47 Q60 40 86 55" stroke="#FE06AB" strokeWidth="5" fill="none" opacity=".35" />
      <ellipse cx="60" cy="45" rx="53" ry="12" transform="rotate(-24 60 45)" fill="none" stroke="#0DFCFD" strokeWidth="4" />
    </svg>
    <svg className="vx-planet vx-planet-b" viewBox="0 0 80 80" focusable="false">
      <circle cx="40" cy="40" r="30" fill="#FC9E3D" />
      <path d="M40 10 A30 30 0 0 1 40 70 A24 30 0 0 0 40 10" fill="#BC071D" opacity=".4" />
      <circle cx="29" cy="29" r="5" fill="#FFB1C1" opacity=".6" /><circle cx="42" cy="51" r="7" fill="#BC071D" opacity=".25" />
    </svg>
    <svg className="vx-aircraft vx-plane" viewBox="0 0 150 95" focusable="false">
      <path d="M8 61 L20 56 L47 58 L65 18 L78 16 L69 57 L120 54 Q141 54 143 62 Q141 70 119 71 L68 70 L85 88 L73 90 L48 71 L18 70Z" fill="#CFC9DC" />
      <path d="M17 59 L8 34 L20 34 L39 60" fill="#FE06AB" /><path d="M65 18 L78 16 L75 28 L61 28" fill="#0DFCFD" />
      <path d="M111 56 L121 57 L127 61 L111 61" fill="#063A65" />
      <path d="M53 61 H91" stroke="#063A65" strokeWidth="3" strokeDasharray="3 6" />
    </svg>
    <svg className="vx-aircraft vx-helicopter" viewBox="0 0 150 100" focusable="false">
      <path d="M57 49 L19 43 L11 29 H4 L8 51 L53 66" fill="#E0B4FC" />
      <path d="M57 44 Q81 31 104 45 Q126 56 123 69 L59 69 Q45 59 57 44Z" fill="#0DFCFD" />
      <path d="M92 43 Q113 45 121 60 H93Z" fill="#063A65" />
      <path d="M79 40 V24 M29 24 H133" stroke="#CFC9DC" strokeWidth="4" strokeLinecap="round" />
      <path d="M67 69 V81 M110 69 V81 M56 83 H127" stroke="#FE06AB" strokeWidth="4" strokeLinecap="round" />
      <path d="M9 38 L2 47 M4 39 L13 46" stroke="#FC9E3D" strokeWidth="3" />
    </svg>
    {[28, 39, 52, 63].map((top, i) => <svg key={top} className={`vx-cloud vx-cloud-${i}`} style={{top: `${top}%`}} viewBox="0 0 180 70" focusable="false">
      <path d="M24 59 C1 59 5 32 26 32 C30 5 64 3 77 24 C98 1 137 12 138 35 C169 26 185 59 157 59Z" fill="#CFC9DC" />
      <path d="M31 59 H155" stroke="#0DFCFD" strokeWidth="2" opacity=".5" />
    </svg>)}
    <svg className="vx-park-balloons" viewBox="0 0 95 180" focusable="false">
      <path d="M32 60 Q58 105 44 177 M62 88 Q37 117 44 177" stroke="#E0B4FC" fill="none" strokeWidth="1.5" />
      <ellipse cx="29" cy="32" rx="23" ry="29" fill="#FE06AB" /><path d="M25 61 L35 60 L30 54Z" fill="#FE06AB" />
      <ellipse cx="64" cy="64" rx="21" ry="26" fill="#0DFCFD" /><path d="M59 90 L68 90 L64 83Z" fill="#0DFCFD" />
      <path d="M18 16 Q10 23 14 35 M53 51 Q48 58 51 67" stroke="#fff" strokeWidth="3" fill="none" opacity=".5" />
    </svg>
  </>;
}

export function NightSkyline() {
  return (
    <div className="vx-world" aria-hidden>
      <svg className="vx-space-rocket" viewBox="0 0 48 80" focusable="false">
        <path d="M18 57 Q24 77 30 57" fill="var(--vx-orange)" />
        <path d="M21 57 Q24 69 27 57" fill="var(--vx-yellow)" />
        <path d="M15 39 L6 58 L17 54 M33 39 L42 58 L31 54" fill="var(--vx-pink)" />
        <path d="M24 5 C12 19 12 43 18 57 L30 57 C36 43 36 19 24 5Z" fill="var(--vx-text)" stroke="var(--vx-cyan)" strokeWidth="1.5" />
        <path d="M24 5 Q18 12 16 20 L32 20 Q30 12 24 5" fill="var(--vx-pink)" />
        <circle cx="24" cy="32" r="6" fill="var(--vx-navy)" stroke="var(--vx-cyan)" strokeWidth="2" />
      </svg>

      <SkyJourney />
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


      <City />
    </div>
  );
}
