// DRAFT: the lake stage's concert (docs/map3d-lakefront-design.md, L3) as a timeline: given the time, what every
// light, beam, jet and effect does. Pure and deterministic. It runs on the wall clock, so every map in the crowd
// shows the same beat at the same moment, like one real show.
//
// A loop is 64 beats at 128 BPM (30 s): intro, build, drop and breakdown, 16 beats each. Fireworks go up over the
// lake in the drop of every fourth loop (every 2 minutes). Flashes stay at or below 2 a second (photosensitivity
// guidance is at most 3), and `still` (prefers-reduced-motion) turns off flashes, jumps and fast motion.

export const BPM = 128;
export const BEAT = 60 / BPM;
export const SECTION_BEATS = 16;
export const SECTION = BEAT * SECTION_BEATS;
export const LOOP = SECTION * 4;
/** Fireworks every this many loops, in that loop's drop. */
export const FIREWORK_LOOPS = 4;
/** Firework launches in the drop, in beats from its start (one shell each). */
export const SHELL_BEATS = [0, 2, 4, 8, 10, 12];
/** How long a shell lives after its launch (rise, burst and fall), seconds. */
export const SHELL_LIFE = 4.5;
/** How long the confetti flies after the cannons fire, seconds. */
export const CONFETTI_LIFE = 8;

export type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;

type SectionLook = {
  name: "intro" | "build" | "drop" | "breakdown";
  colA: RGB;
  colB: RGB;
  /** The shell's patterns: [chase, equaliser, beat pulse, breathing]. */
  mix: [number, number, number, number];
  /** The crowd's lightsticks: [steady, wave round the bowl, rings out from the stage, phone torches]. */
  crowd: [number, number, number, number];
  /** Beam sweep speed (at the section's start and end), sweep size, and the drop's extra pan (radians). */
  speed: [number, number];
  amp: number;
  pan: number;
  lasers: [number, number];
  sky: number;
  jets: number;
  energy: [number, number];
};

const SECTIONS: SectionLook[] = [
  {
    name: "intro",
    colA: hex("#0dfcfd"),
    colB: hex("#3b6cff"),
    mix: [1, 0, 0, 0.3],
    crowd: [1, 0, 0, 0],
    speed: [1, 1],
    amp: 1,
    pan: 0,
    lasers: [0, 0],
    sky: 1,
    jets: 0.4,
    energy: [0.55, 0.6],
  },
  {
    name: "build",
    colA: hex("#fe06ab"),
    colB: hex("#0dfcfd"),
    mix: [0.5, 0.6, 0.3, 0],
    crowd: [0, 1, 0, 0],
    speed: [1.4, 2.2],
    amp: 1.2,
    pan: 0.1,
    lasers: [0, 1],
    sky: 1,
    jets: 0.45,
    energy: [0.6, 0.92],
  },
  {
    name: "drop",
    colA: hex("#f2ff0b"),
    colB: hex("#fe06ab"),
    mix: [0, 0.7, 1, 0],
    crowd: [0, 0, 1, 0],
    speed: [2.6, 2.6],
    amp: 1.6,
    pan: 0.35,
    lasers: [1, 1],
    sky: 1,
    jets: 0.55,
    energy: [1, 1],
  },
  {
    name: "breakdown",
    colA: hex("#fc9e3d"),
    colB: hex("#e0b4fc"),
    mix: [0.3, 0, 0, 1],
    crowd: [0, 0, 0, 1],
    speed: [0.6, 0.6],
    amp: 0.8,
    pan: 0,
    lasers: [0, 0],
    sky: 0.6,
    jets: 0.35,
    energy: [0.4, 0.35],
  },
];

/** How far the beams have swept by `tau` seconds into a section (its speed ramps from speed[0] to speed[1]). */
function sweepIn(s: SectionLook, tau: number) {
  const [a, b] = s.speed;
  return a * tau + ((b - a) * tau * tau) / (2 * SECTION);
}
const SWEEP_PER_SECTION = SECTIONS.map((s) => sweepIn(s, SECTION));
const SWEEP_PER_LOOP = SWEEP_PER_SECTION.reduce((x, y) => x + y, 0);

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerp3 = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const lerp4 = (a: number[], b: number[], k: number) => a.map((v, i) => lerp(v, b[i], k)) as [number, number, number, number];
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export type ShowFrame = {
  section: number;
  /** Beats since the loop started (continuous, 0..64). */
  beat: number;
  /** 1 on each beat, dying away before the next. */
  pulse: number;
  energy: number;
  colA: RGB;
  colB: RGB;
  mix: [number, number, number, number];
  crowd: [number, number, number, number];
  /** The beams' sweep clock (seconds, run faster in faster sections), their sweep size and extra pan. */
  sweep: number;
  amp: number;
  pan: number;
  lasers: number;
  sky: number;
  /** A white flash on the shell and the stage, 0..1. */
  flash: number;
  /** The flame jets' height, 0..1. */
  flame: number;
  /** The moat fountains' height, 0..1. */
  jets: number;
  /** Seconds since the confetti cannons fired, or -1. */
  confetti: number;
  /** Per firework slot (SHELL_BEATS): seconds since its launch, or -1. */
  shells: number[];
};

/** What the concert does at `t` seconds on the wall clock. */
export function showAt(t: number, still = false): ShowFrame {
  const loopT = ((t % LOOP) + LOOP) % LOOP;
  const loop = Math.floor(t / LOOP);
  const si = Math.min(3, Math.floor(loopT / SECTION));
  const tau = loopT - si * SECTION;
  const s = SECTIONS[si];
  const prev = SECTIONS[(si + 3) % 4];
  const beat = loopT / BEAT;
  const inSection = tau / BEAT;
  const phase = beat - Math.floor(beat);
  // cross-fade from the previous section over its first beat
  const k = smooth(inSection);
  const prog = tau / SECTION;

  const sweep = loop * SWEEP_PER_LOOP + SWEEP_PER_SECTION.slice(0, si).reduce((x, y) => x + y, 0) + sweepIn(s, tau);
  const pulse = Math.exp(-phase * 5) * (s.name === "breakdown" ? 0.3 : 1);
  const dropBeat = s.name === "drop" ? Math.floor(inSection) : -1;
  // one flash on the drop's first beat and on its ninth: 2 in 7.5 s
  const flash = dropBeat === 0 || dropBeat === 8 ? Math.exp(-phase * 9) : 0;
  // the flame jets fire on the same beats, for under a second
  const flameT = s.name === "drop" ? (inSection % 8) * BEAT : -1;
  const flame = flameT >= 0 && flameT < 0.95 ? smooth(flameT / 0.06) * (1 - smooth((flameT - 0.55) / 0.4)) : 0;
  const jets = s.name === "drop" ? 0.4 + 0.6 * pulse : lerp(prev.jets, s.jets, k) + (s.name === "build" ? 0.45 * prog : 0);

  // the cannons fire as the drop starts; the confetti is still falling in the breakdown
  const confettiT = loopT - 2 * SECTION;
  const cycleT = ((t % (LOOP * FIREWORK_LOOPS)) + LOOP * FIREWORK_LOOPS) % (LOOP * FIREWORK_LOOPS);
  const dropStart = LOOP * (FIREWORK_LOOPS - 1) + 2 * SECTION;
  const shells = SHELL_BEATS.map((b) => {
    const since = cycleT - (dropStart + b * BEAT);
    return since >= 0 && since < SHELL_LIFE ? since : -1;
  });

  const frame: ShowFrame = {
    section: si,
    beat,
    pulse,
    energy: lerp(s.energy[0], s.energy[1], prog),
    colA: lerp3(prev.colA, s.colA, k),
    colB: lerp3(prev.colB, s.colB, k),
    mix: lerp4(prev.mix, s.mix, k),
    crowd: lerp4(prev.crowd, s.crowd, k),
    sweep,
    amp: lerp(prev.amp, s.amp, k),
    pan: lerp(prev.pan, s.pan, k),
    lasers: s.name === "build" ? smooth((prog - 0.5) * 2) : lerp(prev.lasers[1], s.lasers[0], k),
    sky: lerp(prev.sky, s.sky, k),
    flash,
    flame,
    jets,
    confetti: confettiT >= 0 && confettiT < CONFETTI_LIFE ? confettiT : -1,
    shells,
  };
  if (still) {
    // no flashes, no jumps, no fast motion: colours change slowly, beams and jets stand still
    Object.assign(frame, { pulse: 0, flash: 0, flame: 0, jets: 0.3, confetti: -1, sweep: 0, amp: 0, pan: 0 });
    frame.shells = shells.map(() => -1);
    frame.crowd = [1, 0, 0, 0];
  }
  return frame;
}

/** The most flashes that start within any one second of the loop (for the photosensitivity check). */
export function maxFlashesPerSecond(step = 0.01): number {
  const starts: number[] = [];
  let was = false;
  for (let t = 0; t < LOOP; t += step) {
    const on = showAt(t).flash > 0.5;
    if (on && !was) starts.push(t);
    was = on;
  }
  return Math.max(0, ...starts.map((s) => starts.filter((x) => x >= s && x < s + 1).length));
}
