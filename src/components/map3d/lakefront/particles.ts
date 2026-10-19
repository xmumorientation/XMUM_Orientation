import * as THREE from "three";

import { rng } from "../funfair/central/kit";
import { DECK_Y, polar, STAGE_R } from "./layout";

// DRAFT: the concert's fireworks over the lake and its confetti over the audience, all in the shaders: each particle
// knows its shell or cannon, its direction and speed, and the time since that one fired (a uniform) gives its place.
// Two draw calls. Fireworks add light (additive); confetti is ordinary paper colour, so it shows by day too.

/** Firework slots: show.ts's scheduled shells (SHELL_BEATS), then two for the opening's bang. */
export const SHELL_SLOTS = 8;
/** Where each slot's shell bursts (venue metres: over the lake behind the stage), and its colour. */
const SHELLS: { p: [number, number, number]; c: string; ring?: boolean }[] = [
  { p: [-12, 58, 46], c: "#fe06ab" },
  { p: [10, 64, 54], c: "#0dfcfd" },
  { p: [0, 72, 62], c: "#f2ff0b", ring: true },
  { p: [-18, 54, 64], c: "#e0b4fc" },
  { p: [16, 58, 42], c: "#fc9e3d" },
  { p: [4, 68, 50], c: "#0dfcfd", ring: true },
  { p: [-8, 60, 48], c: "#f2ff0b" },
  { p: [9, 64, 52], c: "#fe06ab", ring: true },
];
/** Seconds from launch to burst. */
const RISE = 1.1;

const POINTS_COMMON = /* glsl */ `
  uniform float uScale, uMax, uSize;
  varying vec3 vColor;
  void place(vec3 p, float size) {
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(size * uScale / max(-mv.z, 0.001), 1.5, uMax);
  }
  void hide() {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
  }`;

const FIREWORK_VERT = /* glsl */ `
  attribute vec4 aP; // slot, rocket (0) or spark (1), speed (m/s), random
  attribute vec3 aDir;
  uniform float uT[${SHELL_SLOTS}];
  uniform vec3 uPos[${SHELL_SLOTS}];
  uniform vec3 uCol[${SHELL_SLOTS}];
  ${POINTS_COMMON}
  void main() {
    int s = int(aP.x + 0.5);
    float t = uT[s];
    vec3 burst = uPos[s];
    float bright = 0.0;
    vec3 p = burst;
    float size = uSize;
    if (t >= 0.0) {
      if (aP.y < 0.5) {
        // the rocket climbs from the lake, slowing as it rises
        if (t < ${RISE.toFixed(2)}) {
          float k = t / ${RISE.toFixed(2)};
          p = vec3(burst.x, mix(1.0, burst.y, 1.0 - (1.0 - k) * (1.0 - k)), burst.z);
          bright = 1.2;
          size *= 0.7;
        }
      } else {
        // a spark flies out, slows in the air, falls, fades and twinkles out
        float tb = t - ${RISE.toFixed(2)};
        if (tb >= 0.0) {
          p = burst + aDir * aP.z * (1.0 - exp(-1.8 * tb)) / 1.8 - vec3(0.0, 1.8 * tb * tb, 0.0);
          float twinkle = tb > 1.4 ? 0.55 + 0.45 * step(0.5, fract(aP.w * 13.0 + tb * 8.0)) : 1.0;
          bright = (1.0 - smoothstep(1.2, 3.0, tb)) * twinkle * (1.0 + 2.0 * exp(-tb * 8.0));
        }
      }
    }
    if (bright <= 0.001) {
      hide();
      return;
    }
    place(p, size);
    vColor = mix(uCol[s], vec3(1.0), aP.y < 0.5 ? 0.7 : 0.15) * bright;
  }`;

const FIREWORK_FRAG = /* glsl */ `
  uniform float uOn;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = pow(max(0.0, 1.0 - d), 1.6);
    gl_FragColor = vec4(vColor * a * uOn, 1.0);
    #include <colorspace_fragment>
  }`;

const CONFETTI_VERT = /* glsl */ `
  attribute vec4 aC; // cannon, speed (m/s), random phase, colour
  attribute vec3 aDir;
  uniform float uT;
  uniform vec3 uCannon[2];
  uniform vec3 uColors[6];
  varying float vSpin;
  ${POINTS_COMMON}
  void main() {
    if (uT < 0.0) {
      hide();
      return;
    }
    float t = uT;
    // shot up and out, held back by the air, then drifting down at a slow flutter
    vec3 v0 = aDir * aC.y;
    vec3 vt = vec3(0.0, -1.3, 0.0);
    vec3 p = uCannon[int(aC.x + 0.5)] + vt * t + (v0 - vt) * (1.0 - exp(-1.5 * t)) / 1.5;
    float flutter = smoothstep(0.6, 2.0, t);
    p.x += sin(t * 2.6 + aC.z * 6.28) * 0.9 * flutter;
    p.z += cos(t * 2.1 + aC.z * 9.0) * 0.9 * flutter;
    p.y = max(p.y, 0.6);
    float fade = 1.0 - smoothstep(6.0, 8.0, t);
    if (fade <= 0.001) {
      hide();
      return;
    }
    place(p, uSize * fade);
    vColor = uColors[int(aC.w + 0.5)];
    vSpin = t * (5.0 + aC.z * 4.0) + aC.z * 6.28;
  }`;

const CONFETTI_FRAG = /* glsl */ `
  uniform float uOn;
  varying vec3 vColor;
  varying float vSpin;
  void main() {
    // a little paper rectangle, spinning and flipping as it falls
    vec2 q = gl_PointCoord - 0.5;
    float c = cos(vSpin);
    float s = sin(vSpin);
    q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
    if (abs(q.x) > 0.5 * abs(cos(vSpin * 0.7)) + 0.05 || abs(q.y) > 0.24) discard;
    gl_FragColor = vec4(vColor * 1.15, uOn);
    #include <colorspace_fragment>
  }`;

type U<T> = { value: T };
export type ParticleUniforms = {
  scale: U<number>;
  max: U<number>;
  fireSize: U<number>;
  confettiSize: U<number>;
  fireOn: U<number>;
  confettiOn: U<number>;
  shellT: U<number[]>;
  confettiT: U<number>;
};

export function makeParticleUniforms(): ParticleUniforms {
  return {
    scale: { value: 1 },
    max: { value: 64 },
    fireSize: { value: 0.2 },
    confettiSize: { value: 0.06 },
    fireOn: { value: 0 },
    confettiOn: { value: 0 },
    shellT: { value: new Array(SHELL_SLOTS).fill(-1) },
    confettiT: { value: -1 },
  };
}

const COLORS = ["#fe06ab", "#0dfcfd", "#f2ff0b", "#e0b4fc", "#fc9e3d", "#ffffff"];

export function fireworkMaterial(u: ParticleUniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: FIREWORK_VERT,
    fragmentShader: FIREWORK_FRAG,
    uniforms: {
      uT: u.shellT,
      uPos: { value: SHELLS.map((s) => new THREE.Vector3(...s.p)) },
      uCol: { value: SHELLS.map((s) => new THREE.Color(s.c)) },
      uScale: u.scale,
      uMax: u.max,
      uSize: u.fireSize,
      uOn: u.fireOn,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function confettiMaterial(u: ParticleUniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: CONFETTI_VERT,
    fragmentShader: CONFETTI_FRAG,
    uniforms: {
      uT: u.confettiT,
      uCannon: { value: [-28, 28].map((d) => new THREE.Vector3(...polar(STAGE_R - 0.8, (d * Math.PI) / 180, DECK_Y + 0.6))) },
      uColors: { value: COLORS.map((c) => new THREE.Color(c)) },
      uScale: u.scale,
      uMax: u.max,
      uSize: u.confettiSize,
      uOn: u.confettiOn,
    },
    transparent: true,
    depthWrite: false,
  });
}

/** Every shell's rocket and sparks (a sphere, or a ring for some). */
export function fireworkGeometry(lite: boolean) {
  const r = rng(53);
  const sparks = lite ? 46 : 90;
  const p: number[] = [];
  const dir: number[] = [];
  SHELLS.forEach((sh, s) => {
    p.push(s, 0, 0, r());
    dir.push(0, 1, 0);
    // a tilted ring for some shells, an even sphere (Fibonacci) for the rest
    const tilt = r() * 0.8;
    for (let i = 0; i < sparks; i++) {
      let d: [number, number, number];
      if (sh.ring) {
        const a = (i / sparks) * Math.PI * 2;
        d = [Math.cos(a), Math.sin(a) * Math.sin(tilt), Math.sin(a) * Math.cos(tilt)];
      } else {
        const y = 1 - (2 * (i + 0.5)) / sparks;
        const rad = Math.sqrt(1 - y * y);
        const a = i * 2.39996 + r() * 0.3;
        d = [Math.cos(a) * rad, y, Math.sin(a) * rad];
      }
      p.push(s, 1, (sh.ring ? 38 : 32) + r() * 7, r());
      dir.push(...d);
    }
  });
  const g = new THREE.BufferGeometry();
  // positions are worked out in the shader: a dummy attribute for three.js's count
  g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(dir.length), 3));
  g.setAttribute("aP", new THREE.Float32BufferAttribute(p, 4));
  g.setAttribute("aDir", new THREE.Float32BufferAttribute(dir, 3));
  return g;
}

/** Confetti from the two cannons at the stage's front: shot up and out over the audience. */
export function confettiGeometry(lite: boolean) {
  const r = rng(71);
  const n = lite ? 120 : 260;
  const c: number[] = [];
  const dir: number[] = [];
  for (let i = 0; i < n; i++) {
    const cannon = i % 2;
    const side = cannon ? 1 : -1;
    const d: [number, number, number] = [side * (0.1 + r() * 0.35) + (r() - 0.5) * 0.3, 1, -(0.4 + r() * 0.6)];
    const l = Math.hypot(...d);
    dir.push(d[0] / l, d[1] / l, d[2] / l);
    c.push(cannon, 13 + r() * 9, r(), Math.floor(r() * COLORS.length));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(dir.length), 3));
  g.setAttribute("aC", new THREE.Float32BufferAttribute(c, 4));
  g.setAttribute("aDir", new THREE.Float32BufferAttribute(dir, 3));
  return g;
}
