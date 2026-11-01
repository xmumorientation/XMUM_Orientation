import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// DRAFT: a tennis player for the tennis game (docs/ROADMAP.md, item 9). A toy-like figure in metres, standing on
// the origin and facing +z (its right hand is at -x), with a racket in the right hand: a big round head with eyes
// and a headband in the shirt's colour, round joints, white socks and chunky shoes. Its joints are bones (hips,
// knees, shoulders, elbows), and the figure is one SkinnedMesh with one vertex-coloured material: one draw call
// (batch T1c; five meshes before). Its shadow is the same mesh flattened onto the court away from the sun, one more
// draw call and no shadow map, so phones get it too. posePlayer() moves it every frame; nothing re-renders React.

/** Players are drawn bigger than life, like the courts' posts and nets (sports.tsx LIFT), so they read on the map. */
export const PLAYER_SCALE = 1.6;

const SKIN = "#c98e66";
const SHORTS = "#1f2430";
const SHOE = "#f2f2ee";
const SOCK = "#f4f4f0";
const HAIR = "#2a211c";
const EYE = "#1b1512";
const GRIP = "#2b2b30";
const FRAME = "#f4f4f2";
const STRINGS = "#d6dcc4";

const HIP_Y = 0.88;
/** The knees, down the legs from the hips: the thigh's length, and the shin's down to the sole. */
const KNEE_Y = 0.42;
const SHIN = HIP_Y - KNEE_Y;
/** The shoulders, from the hips. */
const SHOULDER = { x: 0.25, y: 0.5 };
/** The elbows, down the arms from the shoulders. */
const ELBOW_Y = 0.32;
/** The racket head's middle, down the right arm from the shoulder, and half its length. */
const RACKET_Y = 1.05;
const RACKET_HALF = 0.15;
/** The hand, down the arm from the shoulder. */
const HAND_Y = 0.62;
/** The head: its middle above the hips, and its radius (big, like a toy's). */
const HEAD_Y = 0.83;
const HEAD_R = 0.18;

/** How the figure stands. Angles in radians, lengths in metres (before PLAYER_SCALE). */
export type Pose = {
  /** The upper body's turn at the hips (+ turns to the player's left), and its lean (+ forward). */
  twist: number;
  lean: number;
  /** The racket arm: its turn round the shoulder (0 out to the right, + toward the front) and its lift (0 hanging, π/2 level). */
  sweep: number;
  raise: number;
  /**
   * The racket arm's elbow: + folds the forearm toward the arm's front, - toward its back. `roll` turns the upper
   * arm on its own axis first, so the elbow folds the forearm another way (up, for the serve).
   */
  elbow: number;
  roll: number;
  /** The other arm: + toward the front, its lift and its elbow. */
  offSweep: number;
  offRaise: number;
  offElbow: number;
  /** The legs' swing, forward and sideways. */
  strideX: number;
  strideZ: number;
  /** Each knee's bend from the run (the leg swinging through), on top of the bend that keeps the feet down in a crouch. */
  knees: [number, number];
  /** How far the body sinks (knees bent), and how far it rises off the court (running, jumping). */
  crouch: number;
  bob: number;
};

export type Rig = {
  /** On the court: position and facing. Scaled by PLAYER_SCALE. */
  root: THREE.Group;
  body: THREE.Bone;
  legs: [THREE.Bone, THREE.Bone];
  knees: [THREE.Bone, THREE.Bone];
  upper: THREE.Bone;
  arm: THREE.Bone;
  armLift: THREE.Bone;
  elbow: THREE.Bone;
  off: THREE.Bone;
  offLift: THREE.Bone;
  offElbow: THREE.Bone;
  /** Every bone, each after its parent: the skeleton. */
  bones: THREE.Bone[];
  /** The racket head's middle, where the ball is hit. */
  sweetSpot: THREE.Object3D;
  /** The racket head's tip and throat (a swing's blur runs between them), and the other hand (it tosses the serve). */
  tip: THREE.Object3D;
  throat: THREE.Object3D;
  hand: THREE.Object3D;
};

function bone(parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const b = new THREE.Bone();
  b.position.set(x, y, z);
  parent.add(b);
  return b;
}

/** A point down a limb from its joint. */
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
  const body = bone(root);
  const legs: [THREE.Bone, THREE.Bone] = [bone(body, 0.1, HIP_Y), bone(body, -0.1, HIP_Y)];
  const knees: [THREE.Bone, THREE.Bone] = [bone(legs[0], 0, -KNEE_Y), bone(legs[1], 0, -KNEE_Y)];
  const upper = bone(body, 0, HIP_Y);
  const arm = bone(upper, -SHOULDER.x, SHOULDER.y);
  const armLift = bone(arm);
  const elbow = bone(armLift, 0, -ELBOW_Y);
  // the roll (y) turns the fold (x) round the upper arm
  elbow.rotation.order = "YXZ";
  const off = bone(upper, SHOULDER.x, SHOULDER.y);
  const offLift = bone(off);
  const offElbow = bone(offLift, 0, -ELBOW_Y);
  const sweetSpot = marker(elbow, RACKET_Y - ELBOW_Y);
  const tip = marker(elbow, RACKET_Y + RACKET_HALF - ELBOW_Y);
  const throat = marker(elbow, RACKET_Y - RACKET_HALF - ELBOW_Y);
  const hand = marker(offElbow, HAND_Y - ELBOW_Y);
  const bones = [body, legs[0], knees[0], legs[1], knees[1], upper, arm, armLift, elbow, off, offLift, offElbow];
  return { root, body, legs, knees, upper, arm, armLift, elbow, off, offLift, offElbow, bones, sweetSpot, tip, throat, hand };
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

/** A round tube down y, from `top` (radius r0) to `bottom` (radius r1). */
const tube = (r0: number, r1: number, top: number, bottom: number, color: string) =>
  colored(new THREE.CylinderGeometry(r0, r1, top - bottom, 12).translate(0, (top + bottom) / 2, 0), color);
/** A ball at (x, y, z). Joints get one, so a limb bends round it with no gap. */
const ball = (r: number, x: number, y: number, z: number, color: string) => colored(new THREE.SphereGeometry(r, 12, 9).translate(x, y, z), color);

/** The upper arm, from its shoulder: the round shoulder and sleeve, and the skin down to the elbow. */
function upperArmGeometry(shirt: string) {
  return mergeGeometries([ball(0.085, 0, -0.01, 0, shirt), tube(0.082, 0.07, 0, -0.17, shirt), tube(0.05, 0.046, -0.15, -0.33, SKIN)])!;
}

/**
 * The forearm, from the elbow: the round elbow, a white wristband and the hand. The right one holds the racket below
 * the hand (strings face +z).
 */
function forearmGeometry(racket: boolean) {
  const hand = -(HAND_Y - ELBOW_Y);
  const parts = [
    ball(0.05, 0, 0, 0, SKIN),
    tube(0.047, 0.04, 0, -0.26, SKIN),
    tube(0.048, 0.048, -0.2, -0.25, SOCK),
    colored(new THREE.IcosahedronGeometry(0.058, 1).translate(0, hand, 0), SKIN),
  ];
  if (racket) {
    const head = -(RACKET_Y - ELBOW_Y);
    parts.push(
      tube(0.021, 0.024, hand, head + RACKET_HALF, GRIP),
      colored(new THREE.TorusGeometry(0.12, 0.018, 6, 20).scale(1, 1.25, 1).translate(0, head, 0), FRAME),
      colored(new THREE.CircleGeometry(0.112, 20).scale(1, 1.25, 1).translate(0, head, 0), STRINGS),
    );
  }
  return mergeGeometries(parts)!;
}

/**
 * Hips, shirt and head, from the hips. The head has two eyes, and its hair sits back over a headband in the shirt's
 * colour, so the face shows which way the player looks.
 */
function bodyGeometry(shirt: string) {
  // the eyes, on the face just under its middle
  const eye = (side: number) => {
    const [x, dy] = [0.062 * side, -0.012];
    const z = Math.sqrt(HEAD_R * HEAD_R - x * x - dy * dy) - 0.004;
    return colored(new THREE.SphereGeometry(0.024, 8, 6).scale(1, 1.35, 0.55).translate(x, HEAD_Y + dy, z), EYE);
  };
  return mergeGeometries([
    colored(new THREE.CylinderGeometry(0.175, 0.18, 0.2, 12).scale(1, 1, 0.75), SHORTS),
    colored(new THREE.CylinderGeometry(0.2, 0.17, 0.5, 12).scale(1, 1, 0.72).translate(0, 0.33, 0), shirt),
    // the shirt's round top, over the shoulders
    colored(new THREE.SphereGeometry(0.2, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 0.72).translate(0, 0.58, 0), shirt),
    tube(0.055, 0.06, HEAD_Y - HEAD_R + 0.03, 0.58, SKIN),
    colored(new THREE.IcosahedronGeometry(HEAD_R, 3).translate(0, HEAD_Y, 0), SKIN),
    eye(1),
    eye(-1),
    // the headband stays inside the hair (even between its vertices), so it shows only under the hairline in front
    colored(new THREE.TorusGeometry(0.168, 0.016, 6, 28).rotateX(Math.PI / 2).translate(0, HEAD_Y + 0.055, 0), shirt),
    colored(
      new THREE.SphereGeometry(HEAD_R + 0.018, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-0.35).translate(0, HEAD_Y, -0.005),
      HAIR,
    ),
  ])!;
}

/** A thigh from the hip: the shorts and the skin down to the knee. */
function thighGeometry() {
  return mergeGeometries([tube(0.1, 0.094, 0.04, -0.3, SHORTS), tube(0.066, 0.06, -0.26, -0.42, SKIN)])!;
}

/** A shin from the knee: the round knee, a white sock and a chunky round shoe, its bottom just under the court. */
function shinGeometry() {
  return mergeGeometries([
    ball(0.062, 0, 0, 0, SKIN),
    tube(0.058, 0.044, 0, -0.34, SKIN),
    tube(0.05, 0.05, -0.27, -0.39, SOCK),
    colored(new THREE.SphereGeometry(0.1, 12, 8).scale(0.72, 0.5, 1.4).translate(0, 0.035 - SHIN, 0.045), SHOE),
  ])!;
}

/** Puts a part, made in its bone's frame, where the bone stands at rest, all its weight on that bone. */
function onBone(geo: THREE.BufferGeometry, rig: Rig, b: THREE.Bone) {
  geo.applyMatrix4(b.matrixWorld);
  const n = geo.getAttribute("position").count;
  const index = new Uint16Array(n * 4);
  const weight = new Float32Array(n * 4);
  const i = rig.bones.indexOf(b);
  for (let v = 0; v < n; v++) {
    index[v * 4] = i;
    weight[v * 4] = 1;
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(index, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weight, 4));
  return geo;
}

/** The material every player shares: smooth, so the round parts read as round. */
export function playerMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
}

/** Shadows lie this far over the court (world units), over its crisp surface (surface.tsx). */
const SHADOW_Y = 0.02;
/** With a low sun, a shadow is at most this many times as long as the player is tall. */
const SHADOW_LONG = 1.6;
/** Before the scene's sun is found: from the side and behind, as at sunset. */
const SHADOW_SLOPE = new THREE.Vector2(1.2, -0.4);
/** Shadows draw after the courts (their surface is renderOrder 1), as the ball's does. */
const SHADOW_ORDER = 2;

const viewNormal = new THREE.Vector3();
const viewPoint = new THREE.Vector3();

/**
 * The players' shadows: their figures flattened onto the court, away from the sun (aimShadows). Each pixel is
 * darkened once, where a shadow's own parts overlap too. Every layer gets the depth of the court's plane at that
 * pixel, worked out from the pixel alone (not interpolated, which differs a little between triangles), so a second
 * layer fails the depth test every time and the shadow is even, not blotchy.
 */
export function playerShadowMaterial() {
  const slope = { value: SHADOW_SLOPE.clone() };
  // the court's plane in the camera's view space (its normal, and its distance along it), and the camera's lens
  const plane = { value: new THREE.Vector4() };
  const viewport = { value: new THREE.Vector4() };
  const proj = { value: new THREE.Matrix4() };
  const unproj = { value: new THREE.Matrix4() };
  const m = new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.32, depthFunc: THREE.LessDepth });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { shadowSlope: slope, shadowPlane: plane, shadowViewport: viewport, shadowProj: proj, shadowUnproj: unproj });
    shader.fragmentShader = shader.fragmentShader.replace(
      "void main() {",
      `uniform vec4 shadowPlane;
      uniform vec4 shadowViewport;
      uniform mat4 shadowProj;
      uniform mat4 shadowUnproj;
      void main() {
        vec2 shadowNdc = ( gl_FragCoord.xy - shadowViewport.xy ) / shadowViewport.zw * 2.0 - 1.0;
        vec4 shadowNear = shadowUnproj * vec4( shadowNdc, -1.0, 1.0 );
        vec3 shadowRay = shadowNear.xyz / shadowNear.w;
        vec4 shadowClip = shadowProj * vec4( shadowRay * ( shadowPlane.w / dot( shadowPlane.xyz, shadowRay ) ), 1.0 );
        gl_FragDepth = shadowClip.z / shadowClip.w * 0.5 + 0.5;`,
    );
    shader.vertexShader = shader.vertexShader.replace("void main() {", "uniform vec2 shadowSlope;\nvoid main() {").replace(
      "#include <project_vertex>",
      `vec4 shadowAt = modelMatrix * vec4( transformed, 1.0 );
      shadowAt.xz -= shadowSlope * max( 0.0, shadowAt.y - ${SHADOW_Y.toFixed(3)} );
      shadowAt.y = ${SHADOW_Y.toFixed(3)};
      vec4 mvPosition = viewMatrix * shadowAt;
      gl_Position = projectionMatrix * mvPosition;`,
    );
  };
  m.onBeforeRender = (renderer, _scene, camera) => {
    renderer.getCurrentViewport(viewport.value);
    proj.value.copy(camera.projectionMatrix);
    unproj.value.copy(camera.projectionMatrixInverse);
    viewNormal.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
    viewPoint.set(0, SHADOW_Y, 0).applyMatrix4(camera.matrixWorldInverse);
    plane.value.set(viewNormal.x, viewNormal.y, viewNormal.z, viewNormal.dot(viewPoint));
  };
  m.userData.slope = slope.value;
  return m;
}

const suns = new WeakMap<THREE.Scene, THREE.DirectionalLight | null>();
const sunDir = new THREE.Vector3();

/** Points the shadows of `material` (playerShadowMaterial) away from the scene's sun: the map's directional light. */
export function aimShadows(material: THREE.Material, scene: THREE.Scene) {
  let sun = suns.get(scene);
  if (sun === undefined || (sun && !sun.parent)) {
    sun = null;
    scene.traverse((o) => {
      if (!sun && o instanceof THREE.DirectionalLight) sun = o;
    });
    suns.set(scene, sun);
  }
  const slope = material.userData.slope as THREE.Vector2 | undefined;
  if (!slope || !sun) return;
  sunDir.subVectors(sun.position, sun.target.position).normalize();
  if (sunDir.y < 0.05) return;
  slope.set(sunDir.x / sunDir.y, sunDir.z / sunDir.y);
  if (slope.length() > SHADOW_LONG) slope.setLength(SHADOW_LONG);
}

/**
 * A player in a shirt of `shirt` (their group's colour), and with `shadow` (playerShadowMaterial) their shadow.
 * Call dispose() when done.
 */
export function makePlayer(shirt: string, material: THREE.Material, shadow?: THREE.Material) {
  const rig = makeRig();
  // bound at rest and life size, then scaled up
  rig.root.scale.setScalar(1);
  rig.root.updateMatrixWorld(true);
  const geo = mergeGeometries([
    onBone(bodyGeometry(shirt), rig, rig.upper),
    ...rig.legs.map((leg) => onBone(thighGeometry(), rig, leg)),
    ...rig.knees.map((knee) => onBone(shinGeometry(), rig, knee)),
    onBone(upperArmGeometry(shirt), rig, rig.armLift),
    onBone(upperArmGeometry(shirt), rig, rig.offLift),
    onBone(forearmGeometry(true), rig, rig.elbow),
    onBone(forearmGeometry(false), rig, rig.offElbow),
  ])!;
  const skeleton = new THREE.Skeleton(rig.bones);
  const meshes = [material, shadow].flatMap((m) => {
    if (!m) return [];
    const mesh = new THREE.SkinnedMesh(geo, m);
    // the pose moves the figure about, and its bounds are not kept up to date: never culled
    mesh.frustumCulled = false;
    rig.root.add(mesh);
    mesh.bind(skeleton);
    return [mesh];
  });
  if (meshes[1]) meshes[1].renderOrder = SHADOW_ORDER;
  rig.root.scale.setScalar(PLAYER_SCALE);
  return {
    rig,
    dispose: () => {
      geo.dispose();
      skeleton.dispose();
    },
  };
}

/** The feet stand a little apart, ready. */
const STANCE = 0.08;

/** The thigh's swing forward and the knee's bend that keep the foot under the hip with the hip `drop` lower. */
function legBend(drop: number): [number, number] {
  if (drop <= 0) return [0, 0];
  const d = HIP_Y - drop;
  const knee = Math.acos(Math.min(1, Math.max(-1, (d * d - KNEE_Y * KNEE_Y - SHIN * SHIN) / (2 * KNEE_Y * SHIN))));
  return [Math.atan2(SHIN * Math.sin(knee), KNEE_Y + SHIN * Math.cos(knee)), knee];
}

export function posePlayer(rig: Rig, p: Pose) {
  rig.body.position.y = p.bob - p.crouch;
  rig.upper.rotation.set(p.lean, p.twist, 0);
  rig.arm.rotation.y = p.sweep;
  rig.armLift.rotation.z = -p.raise;
  rig.elbow.rotation.set(-p.elbow, p.roll, 0);
  rig.off.rotation.y = -p.offSweep;
  rig.offLift.rotation.z = p.offRaise;
  rig.offElbow.rotation.x = -p.offElbow;
  const [thigh, knee] = legBend(p.crouch - p.bob);
  rig.legs[0].rotation.set(p.strideX - thigh, 0, STANCE + p.strideZ);
  rig.legs[1].rotation.set(-p.strideX - thigh, 0, -STANCE - p.strideZ);
  rig.knees[0].rotation.x = knee + p.knees[0];
  rig.knees[1].rotation.x = knee + p.knees[1];
}

// ── The legs ────────────────────────────────────────────────────────────────

/** Steps per second while running, as a leg-swing phase rate. */
export const STEP_RATE = 11;
/** At full speed, a leg swinging through bends its knee this much (radians). */
const KICK = 1.1;

export type Legs = Pick<Pose, "strideX" | "strideZ" | "knees" | "bob">;

/**
 * The legs at time t for a player running at `fwd` (toward the net) and `right` (to their right), in m/s. A leg
 * swinging forward bends its knee; the one pushing back stays straight.
 */
export function runLegs(t: number, fwd: number, right: number): Legs {
  const a = t * STEP_RATE;
  const step = Math.sin(a);
  const speed = Math.min(1, Math.hypot(fwd, right) / 3);
  // leg 0 swings back as sin(a) rises, so it comes through while cos(a) < 0
  const kick = Math.cos(a) * KICK * speed;
  return {
    strideX: step * 0.55 * Math.min(1, Math.abs(fwd) / 3),
    strideZ: step * 0.4 * Math.min(1, Math.abs(right) / 3),
    knees: [Math.max(0, -kick), Math.max(0, kick)],
    bob: Math.abs(step) * 0.05 * speed,
  };
}

/** The split-step: a small hop as the other player hits, landing wide and low, ready to go either way (s). */
const SPLIT_S = 0.42;
const SPLIT_HOP = 0.45;

/** `pose` with the split-step `rel` seconds after the other player's hit (unchanged outside it). */
export function splitStep(pose: Pose, rel: number): Pose {
  if (!(rel >= 0 && rel < SPLIT_S)) return pose;
  const u = rel / SPLIT_S;
  const up = u < SPLIT_HOP ? Math.sin((Math.PI * u) / SPLIT_HOP) : 0;
  const land = u < SPLIT_HOP ? 0 : Math.sin((Math.PI * (u - SPLIT_HOP)) / (1 - SPLIT_HOP));
  return {
    ...pose,
    bob: pose.bob + 0.08 * up,
    crouch: pose.crouch + 0.09 * land,
    strideZ: pose.strideZ + 0.1 * land,
    knees: [pose.knees[0] + 0.35 * up, pose.knees[1] + 0.35 * up],
  };
}

// ── The swing ───────────────────────────────────────────────────────────────

/** Forehand (the ball on the racket side) or backhand. */
export type Hand = 1 | -1;

export type SwingPose = Pick<Pose, "twist" | "lean" | "sweep" | "raise" | "elbow" | "roll" | "offSweep" | "offRaise" | "offElbow" | "crouch">;

type Key = [
  twist: number,
  sweep: number,
  raise: number,
  offSweep: number,
  offRaise: number,
  crouch: number,
  elbow: number,
  offElbow: number,
  roll: number,
];

/** Seconds from the contact: ready, wind-up, contact, follow-through, ready again. */
const KEY_T = [-0.75, -0.3, 0, 0.25, 0.75];
/** Racket in front, angled down, both elbows bent. */
const READY: Key = [0, 0.75, 0.65, 0.5, 0.4, 0.05, 0.55, 0.9, 0];
/**
 * Racket taken back behind the right side, through the ball beside the body, over the left shoulder. The racket
 * arm is straight at the contact, so the racket meets the ball where the game expects (racketAtContact).
 */
const FOREHAND: Key[] = [
  READY,
  [-0.6, -1.0, 1.05, 1.2, 1.0, 0.09, 0.45, 0.25, 0],
  [0.05, 0.15, 1.25, 0.7, 0.7, 0.08, 0, 0.5, 0],
  [0.6, 1.9, 2.1, 0.2, 0.4, 0.04, 1.2, 0.7, 0],
  READY,
];
/** Racket brought across to the left and back, through the ball on the left, up over the right side. */
const BACKHAND: Key[] = [
  READY,
  [0.8, 3.27, 1.1, 1.4, 0.5, 0.09, 0.5, 1.1, 0],
  [0.1, 2.74, 1.3, 0.3, 0.7, 0.08, 0, 0.6, 0],
  [-0.5, 1.77, 2.0, -0.2, 0.9, 0.04, 0.5, 0.3, 0],
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

const toPose = (v: Key): SwingPose => ({
  twist: v[0],
  lean: 0,
  sweep: v[1],
  raise: v[2],
  elbow: v[6],
  roll: v[8],
  offSweep: v[3],
  offRaise: v[4],
  offElbow: v[7],
  crouch: v[5],
});

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
/**
 * Seconds from the serve's contact: the ball in hand, the toss (the tossing arm straight up), the trophy pose (the
 * elbow out at shoulder height, the forearm and racket up behind the head), contact (arm straight), follow-through.
 */
const SERVE_T = [-0.9, -TOSS_S, -0.2, 0, 0.3, 0.75];
const SERVE: Key[] = [
  [0, 0.9, 0.5, 1.2, 0.9, 0.04, 0.3, 0.2, 0],
  [-0.45, -0.5, 0.9, 1.45, 2.7, 0.12, 0.5, 0, -0.6],
  [-0.6, -0.5, 1.75, 1.4, 2.4, 0.16, 1.7, 0.3, -1.9],
  [0.2, 0.8, 2.85, 1.3, 1.1, -0.06, 0, 0.9, 0],
  [0.75, 2.4, 1.0, 0.6, 0.5, 0.08, 0.4, 0.8, 0],
  READY,
];

/** The upper body `rel` seconds from the serve's contact. */
export function servePose(rel: number): SwingPose {
  return toPose(keyed(rel, SERVE_T, SERVE));
}

// ── The match's end ─────────────────────────────────────────────────────────

/** The winner jumps twice, JUMP_S each, from END_JUMP after the last point; both poses hold after END_S. */
const END_JUMP = 0.3;
const JUMP_S = 0.4;
const JUMP_GAP = 0.55;
export const END_S = END_JUMP + JUMP_GAP + JUMP_S + 0.1;
/** The players turn from how they stood into their end pose over this long (s). */
const END_BLEND = 0.35;

const hop = (u: number) => (u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0);

/**
 * The pose `rel` seconds after the match ended: the winner raises the racket and jumps twice, pumping the other
 * fist (the elbow by the side, the forearm up); the loser's head and racket drop.
 */
export function endPose(rel: number, won: boolean): Pose {
  if (!won) {
    return {
      twist: -0.1,
      lean: 0.38,
      sweep: 0.35,
      raise: 0.12,
      elbow: 0.15,
      roll: 0,
      offSweep: 0.3,
      offRaise: 0.12,
      offElbow: 0.25,
      strideX: 0,
      strideZ: 0,
      knees: [0, 0],
      crouch: 0.05,
      bob: 0,
    };
  }
  const j = hop((rel - END_JUMP) / JUMP_S) + hop((rel - END_JUMP - JUMP_GAP) / JUMP_S);
  return {
    twist: 0.15,
    lean: -0.08,
    sweep: 0.55,
    raise: 2.95,
    elbow: 0.1,
    roll: 0,
    offSweep: 0.25,
    offRaise: 0.35 + 0.35 * j,
    offElbow: 2.2,
    strideX: 0,
    strideZ: 0.08,
    knees: [0.7 * j, 0.7 * j],
    crouch: 0.05 * (1 - j),
    bob: 0.18 * j,
  };
}

const ANGLES = ["twist", "lean", "sweep", "raise", "elbow", "roll", "offSweep", "offRaise", "offElbow", "strideX", "strideZ", "crouch", "bob"] as const;

/** `from` turning into the end pose, `rel` seconds after the match ended. */
export function toEndPose(from: Pose, rel: number, won: boolean): Pose {
  const to = endPose(rel, won);
  const k = ease(Math.min(1, Math.max(0, rel / END_BLEND)));
  const mix = (a: number, b: number) => a + (b - a) * k;
  const out = { ...to, knees: [mix(from.knees[0], to.knees[0]), mix(from.knees[1], to.knees[1])] as [number, number] };
  for (const key of ANGLES) out[key] = mix(from[key], to[key]);
  return out;
}

export const STILL: Legs = { strideX: 0, strideZ: 0, knees: [0, 0], bob: 0 };
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
