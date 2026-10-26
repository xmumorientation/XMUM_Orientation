import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// DRAFT: a tennis player for the tennis game (docs/ROADMAP.md, item 9). A low-poly figure in metres, standing on
// the origin and facing +z (its right hand is at -x), with a racket in the right hand. Five meshes share one
// vertex-coloured material: the body (hips, shirt and head), two legs, and two arms (the racket is part of the
// right arm). posePlayer() moves it every frame; nothing re-renders React.

/** Players are drawn bigger than life, like the courts' posts and nets (sports.tsx LIFT), so they read on the map. */
export const PLAYER_SCALE = 1.6;

const SKIN = "#c98e66";
const SHORTS = "#1f2430";
const SHOE = "#f2f2ee";
const HAIR = "#2a211c";
const GRIP = "#2b2b30";
const FRAME = "#f4f4f2";
const STRINGS = "#d6dcc4";

const HIP_Y = 0.88;
/** The shoulders, from the hips. */
const SHOULDER = { x: 0.25, y: 0.5 };
/** The racket head's middle, down the right arm from the shoulder, and half its length. */
const RACKET_Y = 1.05;
const RACKET_HALF = 0.15;
/** The hand, down the arm from the shoulder. */
const HAND_Y = 0.62;

/** How the figure stands. Angles in radians, lengths in metres (before PLAYER_SCALE). */
export type Pose = {
  /** The upper body's turn at the hips; + turns to the player's left. */
  twist: number;
  /** The racket arm: its turn round the shoulder (0 out to the right, + toward the front) and its lift (0 hanging, π/2 level). */
  sweep: number;
  raise: number;
  /** The other arm: + toward the front, and its lift. */
  offSweep: number;
  offRaise: number;
  /** The legs' swing, forward and sideways. */
  strideX: number;
  strideZ: number;
  /** How far the body sinks (knees bent), and its bounce while running. */
  crouch: number;
  bob: number;
};

export type Rig = {
  /** On the court: position and facing. Scaled by PLAYER_SCALE. */
  root: THREE.Group;
  body: THREE.Group;
  legs: [THREE.Group, THREE.Group];
  upper: THREE.Group;
  arm: THREE.Group;
  armLift: THREE.Group;
  off: THREE.Group;
  offLift: THREE.Group;
  /** The racket head's middle, where the ball is hit. */
  sweetSpot: THREE.Object3D;
  /** The racket head's tip and throat (a swing's blur runs between them), and the other hand (it tosses the serve). */
  tip: THREE.Object3D;
  throat: THREE.Object3D;
  hand: THREE.Object3D;
};

function group(parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/** A point down an arm from its shoulder. */
function marker(parent: THREE.Object3D, y: number) {
  const o = new THREE.Object3D();
  o.position.y = -y;
  parent.add(o);
  return o;
}

/** The figure's joints, with no meshes. */
export function makeRig(): Rig {
  const root = new THREE.Group();
  root.scale.setScalar(PLAYER_SCALE);
  const body = group(root);
  const legs: [THREE.Group, THREE.Group] = [group(body, 0.1, HIP_Y), group(body, -0.1, HIP_Y)];
  const upper = group(body, 0, HIP_Y);
  const arm = group(upper, -SHOULDER.x, SHOULDER.y);
  const armLift = group(arm);
  const off = group(upper, SHOULDER.x, SHOULDER.y);
  const offLift = group(off);
  const sweetSpot = marker(armLift, RACKET_Y);
  const tip = marker(armLift, RACKET_Y + RACKET_HALF);
  const throat = marker(armLift, RACKET_Y - RACKET_HALF);
  const hand = marker(offLift, HAND_Y);
  return { root, body, legs, upper, arm, armLift, off, offLift, sweetSpot, tip, throat, hand };
}

/** Non-indexed copy with a flat vertex colour and no uv, ready to merge (as in vegetation.tsx). */
function colored(geo: THREE.BufferGeometry, color: string) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.getAttribute("uv")) g.deleteAttribute("uv");
  const c = new THREE.Color(color);
  const n = g.getAttribute("position").count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) =>
  colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);

/** An arm hanging from its shoulder; the right one holds the racket below the hand (strings face +z). */
function armGeometry(shirt: string, racket: boolean) {
  const parts = [box(0.13, 0.17, 0.13, 0, -0.06, 0, shirt), box(0.085, 0.42, 0.085, 0, -0.38, 0, SKIN), box(0.09, 0.09, 0.09, 0, -0.62, 0, SKIN)];
  if (racket) {
    parts.push(
      box(0.035, 0.24, 0.035, 0, -0.78, 0, GRIP),
      colored(new THREE.TorusGeometry(0.12, 0.016, 4, 14).scale(1, 1.25, 1).translate(0, -RACKET_Y, 0), FRAME),
      colored(new THREE.CircleGeometry(0.112, 14).scale(1, 1.25, 1).translate(0, -RACKET_Y, 0), STRINGS),
    );
  }
  return mergeGeometries(parts)!;
}

/** Hips, shirt and head, from the hips. The hair sits back on the head, so the face shows which way they face. */
function bodyGeometry(shirt: string) {
  return mergeGeometries([
    colored(new THREE.CylinderGeometry(0.17, 0.17, 0.16, 7).scale(1, 1, 0.7), SHORTS),
    colored(new THREE.CylinderGeometry(0.2, 0.16, 0.56, 7).scale(1, 1, 0.62).translate(0, 0.3, 0), shirt),
    colored(new THREE.IcosahedronGeometry(0.135, 1).translate(0, 0.74, 0), SKIN),
    colored(new THREE.SphereGeometry(0.145, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55).rotateX(-0.45).translate(0, 0.74, -0.01), HAIR),
  ])!;
}

/** A leg from the hip: shorts, shin and shoe. */
function legGeometry() {
  return mergeGeometries([
    box(0.17, 0.3, 0.19, 0, -0.13, 0, SHORTS),
    box(0.11, 0.5, 0.12, 0, -0.53, 0, SKIN),
    box(0.13, 0.09, 0.27, 0, -0.835, 0.04, SHOE),
  ])!;
}

/** The material every player shares. */
export function playerMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75, side: THREE.DoubleSide });
}

/** A player in a shirt of `shirt` (their group's colour). Call dispose() when done. */
export function makePlayer(shirt: string, material: THREE.Material) {
  const rig = makeRig();
  const geos = [bodyGeometry(shirt), legGeometry(), armGeometry(shirt, true), armGeometry(shirt, false)];
  const [bodyGeo, legGeo, armGeo, offGeo] = geos;
  rig.upper.add(new THREE.Mesh(bodyGeo, material));
  for (const leg of rig.legs) leg.add(new THREE.Mesh(legGeo, material));
  rig.armLift.add(new THREE.Mesh(armGeo, material));
  rig.offLift.add(new THREE.Mesh(offGeo, material));
  return { rig, dispose: () => geos.forEach((g) => g.dispose()) };
}

/** The feet stand a little apart, ready. */
const STANCE = 0.08;

export function posePlayer(rig: Rig, p: Pose) {
  rig.body.position.y = p.bob - p.crouch;
  rig.upper.rotation.y = p.twist;
  rig.arm.rotation.y = p.sweep;
  rig.armLift.rotation.z = -p.raise;
  rig.off.rotation.y = -p.offSweep;
  rig.offLift.rotation.z = p.offRaise;
  rig.legs[0].rotation.set(p.strideX, 0, STANCE + p.strideZ);
  rig.legs[1].rotation.set(-p.strideX, 0, -STANCE - p.strideZ);
}

// ── The swing ───────────────────────────────────────────────────────────────

/** Forehand (the ball on the racket side) or backhand. */
export type Hand = 1 | -1;

export type SwingPose = Pick<Pose, "twist" | "sweep" | "raise" | "offSweep" | "offRaise" | "crouch">;

type Key = [twist: number, sweep: number, raise: number, offSweep: number, offRaise: number, crouch: number];

/** Seconds from the contact: ready, wind-up, contact, follow-through, ready again. */
const KEY_T = [-0.75, -0.3, 0, 0.25, 0.75];
/** Racket in front, angled down. */
const READY: Key = [0, 0.75, 0.65, 0.5, 0.4, 0.05];
/** Racket taken back behind the right side, through the ball beside the body, over the left shoulder. */
const FOREHAND: Key[] = [
  READY,
  [-0.6, -1.0, 1.05, 1.2, 1.0, 0.09],
  [0.05, 0.15, 1.25, 0.7, 0.7, 0.08],
  [0.6, 1.9, 2.1, 0.2, 0.4, 0.04],
  READY,
];
/** Racket brought across to the left and back, through the ball on the left, up over the right side. */
const BACKHAND: Key[] = [
  READY,
  [0.8, 3.27, 1.1, 1.4, 0.5, 0.09],
  [0.1, 2.74, 1.3, 0.3, 0.7, 0.08],
  [-0.5, 1.77, 2.0, -0.2, 0.9, 0.04],
  READY,
];

const ease = (x: number) => x * x * (3 - 2 * x);

/** The keyframes round time `rel`, blended. */
function keyed(rel: number, times: number[], keys: Key[]): Key {
  let i = 0;
  while (i < times.length - 2 && rel > times[i + 1]) i++;
  const f = ease(Math.min(1, Math.max(0, (rel - times[i]) / (times[i + 1] - times[i]))));
  const [a, b] = [keys[i], keys[i + 1]];
  return a.map((x, k) => x + (b[k] - x) * f) as Key;
}

const toPose = (v: Key): SwingPose => ({ twist: v[0], sweep: v[1], raise: v[2], offSweep: v[3], offRaise: v[4], crouch: v[5] });

/**
 * Per metre the ball is above the usual contact, the racket arm lifts this much (radians); per metre below, the
 * knees bend this much as well. The game solves the lift for each ball's height.
 */
const LIFT_RAISE = 0.62;
const LIFT_CROUCH = 0.18;

/**
 * The upper body `rel` seconds from a contact (ready when it is further than KEY_T's ends). `lift` reaches the
 * racket up (+) or down (-) to the ball round the contact.
 */
export function swingPose(rel: number, hand: Hand, lift = 0): SwingPose {
  const p = toPose(keyed(rel, KEY_T, hand === 1 ? FOREHAND : BACKHAND));
  if (lift === 0) return p;
  const w = ease(Math.max(0, 1 - Math.abs(rel) / 0.45));
  return { ...p, raise: p.raise + lift * LIFT_RAISE * w, crouch: p.crouch + Math.max(0, -lift) * LIFT_CROUCH * w };
}

/** The serve's toss leaves the hand this long before the contact (s). */
export const TOSS_S = 0.5;
/** Seconds from the serve's contact: the ball in hand, the toss, the racket behind the head, contact, follow-through. */
const SERVE_T = [-0.9, -TOSS_S, -0.2, 0, 0.3, 0.75];
const SERVE: Key[] = [
  [0, 0.9, 0.5, 1.2, 0.9, 0.04],
  [-0.45, -0.5, 0.9, 1.45, 2.7, 0.12],
  [-0.6, -1.1, 2.3, 1.4, 2.4, 0.16],
  [0.2, 0.8, 2.85, 1.3, 1.1, -0.06],
  [0.75, 2.4, 1.0, 0.6, 0.5, 0.08],
  READY,
];

/** The upper body `rel` seconds from the serve's contact. */
export function servePose(rel: number): SwingPose {
  return toPose(keyed(rel, SERVE_T, SERVE));
}

export const STILL = { strideX: 0, strideZ: 0, bob: 0 };
const contactCache = new Map<Hand, THREE.Vector3>();
let scratch: Rig | null = null;

/** A point of the rig for a player in this pose, standing on the origin and facing +z (metres, PLAYER_SCALE included). */
function pointAt(pose: Pose, pick: (rig: Rig) => THREE.Object3D) {
  scratch ??= makeRig();
  posePlayer(scratch, pose);
  scratch.root.updateMatrixWorld(true);
  return pick(scratch).getWorldPosition(new THREE.Vector3());
}

/** The racket's sweet spot for a player in this pose (as pointAt). */
export const racketAt = (pose: Pose) => pointAt(pose, (r) => r.sweetSpot);
/** The other hand, which holds the ball for the serve (as pointAt). */
export const handAt = (pose: Pose) => pointAt(pose, (r) => r.hand);

/**
 * Where the racket meets the ball for a player standing on the origin and facing +z, in metres on the court
 * (PLAYER_SCALE included): the rally aims each shot there.
 */
export function racketAtContact(hand: Hand): THREE.Vector3 {
  let v = contactCache.get(hand);
  if (!v) {
    v = racketAt({ ...swingPose(0, hand), ...STILL });
    contactCache.set(hand, v);
  }
  return v.clone();
}
