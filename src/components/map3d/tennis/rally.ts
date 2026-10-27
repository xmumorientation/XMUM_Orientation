import { COURT } from "./court";
import { racketAtContact, runLegs, splitStep, swingPose, type Hand, type Pose } from "./player";

// DRAFT: a looping rally on a tennis court (docs/ROADMAP.md, item 9). Two players hit the ball back and forth
// forever, with no game: /map3d?tennis=demo shows it, and later a busy court shows it from afar. Everything is a
// pure function of the time and a seed, so any moment can be drawn without keeping state. Metres in the court's
// frame (court.ts): player 0 at the -x end, player 1 at +x.

/** Seconds from one player's contact to the other's. */
export const SHOT_S = 1.3;

export type V3 = [number, number, number];

export type PlayerFrame = { x: number; z: number; yaw: number; pose: Pose };
export type RallyFrame = { ball: V3; players: [PlayerFrame, PlayerFrame] };

/** Deterministic noise in [0, 1) for shot k (any integer) and draw n. */
export function rand(seed: number, k: number, n: number) {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k, 0xc2b2ae35) ^ Math.imul(n + 1, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Player 0 faces +x and player 1 faces -x (the figure faces +z before turning). */
export const yawOf = (player: 0 | 1) => (player === 0 ? Math.PI / 2 : -Math.PI / 2);

type Contact = { player: 0 | 1; hand: Hand; body: [number, number]; ball: V3 };

/** Shot k starts at contact k: who hits it (players take turns), forehand or backhand, where they stand, and the ball. */
function contact(k: number, seed: number): Contact {
  const player = (k & 1) as 0 | 1;
  const hand: Hand = rand(seed, k, 0) < 0.6 ? 1 : -1;
  const yaw = yawOf(player);
  const o = racketAtContact(hand);
  const [cos, sin] = [Math.cos(yaw), Math.sin(yaw)];
  const ox = o.x * cos + o.z * sin;
  const oz = -o.x * sin + o.z * cos;
  const ballZ = (rand(seed, k, 1) * 2 - 1) * 3.4;
  const bodyX = (player === 0 ? -1 : 1) * (COURT.halfL + 0.6 + 1.2 * rand(seed, k, 2));
  const bodyZ = ballZ - oz;
  return { player, hand, body: [bodyX, bodyZ], ball: [bodyX + ox, o.y, ballZ] };
}

/**
 * The ball on shot k at share s (0 to 1) of it: over the net to a bounce well inside the receiver's half, then up
 * to their racket. Each part is a parabola, high enough to clear the net.
 */
function ballOnShot(k: number, s: number, seed: number): V3 {
  const a = contact(k, seed).ball;
  const b = contact(k + 1, seed).ball;
  const dx = b[0] - a[0];
  const side = Math.sign(dx);
  const bounceX = side * (COURT.halfL - 2.2 - 4 * rand(seed, k, 3));
  const u = (bounceX - a[0]) / dx;
  const x = a[0] + dx * s;
  const z = a[2] + (b[2] - a[2]) * s;
  // share of the way to the bounce where the ball crosses the net, and how far over it
  const sn = -a[0] / dx / u;
  const clear = 0.5 + 1.2 * rand(seed, k, 4);
  const h1 = Math.max(0.8, (COURT.netTop + clear - a[1] * (1 - sn)) / (4 * sn * (1 - sn)));
  if (s < u) {
    const s1 = s / u;
    return [x, a[1] * (1 - s1) + 4 * h1 * s1 * (1 - s1), z];
  }
  // the same gravity after the bounce
  const s2 = (s - u) / (1 - u);
  const h2 = h1 * ((1 - u) / u) ** 2;
  return [x, b[1] * s2 + 4 * h2 * s2 * (1 - s2), z];
}

/** Leaves its last contact this long after it, and is at the next this long before. */
const LEAVE_S = 0.35;
const ARRIVE_S = 0.3;

const ease = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A player's own contacts round time t: the last one (k0) and the next (k0 + 2). */
function ownContacts(player: 0 | 1, t: number) {
  const k = Math.floor(t / SHOT_S);
  const k0 = (((k - player) % 2) + 2) % 2 === 0 ? k : k - 1;
  return [k0, k0 + 2] as const;
}

function bodyAt(player: 0 | 1, t: number, seed: number): [number, number] {
  const [k0, k1] = ownContacts(player, t);
  const [p0, p1] = [contact(k0, seed).body, contact(k1, seed).body];
  const f = ease(k0 * SHOT_S + LEAVE_S, k1 * SHOT_S - ARRIVE_S, t);
  return [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f];
}

function playerAt(player: 0 | 1, t: number, seed: number): PlayerFrame {
  const [x, z] = bodyAt(player, t, seed);
  const dt = 0.04;
  const [px, pz] = bodyAt(player, t - dt, seed);
  const [vx, vz] = [(x - px) / dt, (z - pz) / dt];
  const yaw = yawOf(player);
  // the run in the player's own frame: toward the net, and to their right
  const fwd = vx * Math.sin(yaw) + vz * Math.cos(yaw);
  const right = -vx * Math.cos(yaw) + vz * Math.sin(yaw);
  // the swing round the nearer of the two contacts
  const [k0, k1] = ownContacts(player, t);
  const near = t - k0 * SHOT_S < k1 * SHOT_S - t ? k0 : k1;
  const pose: Pose = { ...swingPose(t - near * SHOT_S, contact(near, seed).hand), ...runLegs(t, fwd, right) };
  // the split-step as the other player hits (contact k is player k & 1's)
  const k = Math.floor(t / SHOT_S);
  const theirs = (k & 1) === player ? k - 1 : k;
  return { x, z, yaw, pose: splitStep(pose, t - theirs * SHOT_S) };
}

/** The whole court at time t (seconds; any value, the rally never ends). */
export function rallyAt(t: number, seed: number): RallyFrame {
  const k = Math.floor(t / SHOT_S);
  return {
    ball: ballOnShot(k, t / SHOT_S - k, seed),
    players: [playerAt(0, t, seed), playerAt(1, t, seed)],
  };
}
