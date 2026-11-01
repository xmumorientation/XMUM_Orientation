import { SPEC } from "../courts";
import { COURT } from "./court";
import type { V3 } from "./rally";

// DRAFT: the tennis game's ball (docs/ROADMAP.md, item 9, batch T1b). A shot is a flight: when and where the ball
// left the racket, and how fast. The net, the bounces and the roll all follow from that, so any phone that knows
// the shot draws the same path (T2 sends shots between two phones). Metres in the court's frame (court.ts): the
// net at x = 0, y up.

/** Gravity (m/s²). Heights on the courts are drawn LIFT times life size, so the ball falls about that much faster. */
export const G = 16;
/** The ball as drawn, about five times life size so it shows at map distances. It bounces on this radius. */
export const BALL_R = 0.16;
/** A bounce keeps this share of the ball's speed down (sent back up), and of its speed along the ground. */
const BOUNCE_UP = 0.72;
const BOUNCE_ON = 0.78;
/** Slower than this off a bounce (m/s up), the ball rolls, losing this share of its speed each second. */
const ROLL_VY = 1;
const ROLL_DRAG = 1.8;
/** The fence behind each baseline: the ball stops there (metres from the net). */
const FENCE_X = COURT.halfL + 6.2;
/** The net spans the doubles court and runs 0.914 m on past each side, to its posts. */
const NET_HALF = SPEC.tennis.W / 2 + 0.914;
/** The receiver meets the ball at most this far behind their baseline (metres): further back, the near player
 * would stand at the bottom edge of the broadcast view. */
export const MAX_BACK = 2.4;

export type Flight = { t0: number; p: V3; v: V3 };
export type Bounce = { t: number; p: V3 };

/** Seconds from height y, rising at vy, until the ball is down on the ground. */
function fallTime(y: number, vy: number) {
  return (vy + Math.sqrt(Math.max(0, vy * vy + 2 * G * (y - BALL_R)))) / G;
}

const fenced = (x: number, y: number, z: number): V3 => [Math.max(-FENCE_X, Math.min(FENCE_X, x)), y, z];

/** The ball at time t: in the air, bouncing, then rolling; it stops at the back fence. */
export function flightAt(f: Flight, t: number): V3 {
  let [x, y, z] = f.p;
  let [vx, vy, vz] = f.v;
  let left = Math.max(0, t - f.t0);
  for (let i = 0; i < 12; i++) {
    const fall = fallTime(y, vy);
    if (left <= fall) return fenced(x + vx * left, y + vy * left - (G * left * left) / 2, z + vz * left);
    x += vx * fall;
    z += vz * fall;
    y = BALL_R;
    left -= fall;
    vy = (G * fall - vy) * BOUNCE_UP;
    vx *= BOUNCE_ON;
    vz *= BOUNCE_ON;
    if (vy < ROLL_VY) break;
  }
  const k = (1 - Math.exp(-ROLL_DRAG * left)) / ROLL_DRAG;
  return fenced(x + vx * k, BALL_R, z + vz * k);
}

/** The first n bounces (fewer if it starts to roll first). */
export function bounces(f: Flight, n: number): Bounce[] {
  const out: Bounce[] = [];
  let [x, y, z] = f.p;
  let [vx, vy, vz] = f.v;
  let t = f.t0;
  while (out.length < n) {
    const fall = fallTime(y, vy);
    x += vx * fall;
    z += vz * fall;
    y = BALL_R;
    t += fall;
    out.push({ t, p: [x, BALL_R, z] });
    vy = (G * fall - vy) * BOUNCE_UP;
    vx *= BOUNCE_ON;
    vz *= BOUNCE_ON;
    if (vy < ROLL_VY) break;
  }
  return out;
}

/**
 * The flight from `from` (the racket, at time t0) to a first bounce at `to` (x, z), passing over the net with its
 * bottom `clear` metres above the tape: a low clear is a fast, flat shot, a high one a slow, loopy one. A clear
 * below 0 puts it into the net.
 */
export function aim(t0: number, from: V3, to: [number, number], clear: number): Flight {
  const [x0, y0, z0] = from;
  const [xb, zb] = to;
  // share of the way to the bounce where it crosses the net, and the height wanted there
  const share = -x0 / (xb - x0);
  const atNet = COURT.netTop + BALL_R + clear;
  const rise = atNet - y0 * (1 - share) - BALL_R * share;
  const T = Math.max(0.35, Math.sqrt(Math.max(0, (2 * rise) / (G * share * (1 - share)))));
  return { t0, p: from, v: [(xb - x0) / T, (BALL_R - y0 + (G * T * T) / 2) / T, (zb - z0) / T] };
}

/** When and where the ball meets the net, or null when it goes over. */
export function netHit(f: Flight): Bounce | null {
  const [x0, y0, z0] = f.p;
  const [vx, vy, vz] = f.v;
  if (vx === 0 || Math.sign(vx) !== Math.sign(-x0)) return null;
  const tn = -x0 / vx;
  if (tn > fallTime(y0, vy)) return null;
  const y = y0 + vy * tn - (G * tn * tn) / 2;
  const z = z0 + vz * tn;
  if (y - BALL_R >= COURT.netTop || Math.abs(z) > NET_HALF) return null;
  return { t: f.t0 + tn, p: [0, y, z] };
}

/** After it meets the net: the ball drops back on the hitter's side. */
export function offNet(f: Flight, hit: Bounce): Flight {
  const [vx, vy, vz] = f.v;
  const back = -Math.sign(vx);
  const down = vy - G * (hit.t - f.t0);
  return {
    t0: hit.t,
    p: [back * (BALL_R + 0.05), hit.p[1], hit.p[2]],
    v: [back * 0.08 * Math.abs(vx), Math.min(0, down) * 0.15, vz * 0.1],
  };
}

/** Whether a bounce is in: inside the singles court on the receiver's half (`dir`: its x sign). Lines are in. */
export function landsIn(p: V3, dir: number) {
  return p[0] * dir > 0 && Math.abs(p[0]) <= COURT.halfL + 0.05 && Math.abs(p[2]) <= COURT.halfW + 0.03;
}

/**
 * Where the receiver meets the ball: after its first bounce, coming down through racket height `h`, or at the top
 * of the bounce when that is lower. Never further back than MAX_BACK behind the baseline.
 */
export function meetPoint(f: Flight, h: number): Bounce {
  const [b] = bounces(f, 1);
  const vy = (G * (b.t - f.t0) - f.v[1]) * BOUNCE_UP;
  const vx = f.v[0] * BOUNCE_ON;
  let tau = 0.05;
  if (vy >= ROLL_VY) {
    const topY = BALL_R + (vy * vy) / (2 * G);
    tau = topY <= h + 0.25 ? vy / G : (vy + Math.sqrt(vy * vy - 2 * G * (h - BALL_R))) / G;
    const limit = Math.sign(vx) * (COURT.halfL + MAX_BACK);
    if (Math.abs(b.p[0] + vx * tau) > Math.abs(limit)) tau = (limit - b.p[0]) / vx;
  }
  const t = b.t + Math.max(0.05, tau);
  return { t, p: flightAt(f, t) };
}
