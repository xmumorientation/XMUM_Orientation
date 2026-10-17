import * as THREE from "three";

import { rng } from "../funfair/central/kit";
import { AISLE_HW, AISLES, polar, RING_R, RING_Y, SEATS_ARC, TERRACE_D, TERRACE_H, TERRACES } from "./layout";

// DRAFT: the concert's crowd as lightsticks on the terraces, one draw call. Each is a soft dot held up at arm's
// height; it waves, and its colour follows the show (show.ts crowd modes): one steady colour, a wave of colour round
// the bowl, rings racing outwards from the stage on the beat (like synced K-pop lightsticks), or warm phone torches.
// Ordinary (not additive) blending, so the dots still show as colour by day.

const VERT = /* glsl */ `
  attribute vec4 aSeat; // terrace, how far round the bowl (0..1), random, spare
  uniform float uScale, uMax, uSize, uShowT, uBeat;
  uniform vec4 uMode;
  uniform vec3 uColA, uColB;
  varying vec3 vColor;
  void main() {
    float k = aSeat.x;
    float f = aSeat.y;
    float rnd = aSeat.z;
    vec3 p = position + vec3(sin(uShowT * (2.0 + rnd) + rnd * 6.28) * 0.3, abs(sin(uShowT * 3.0 + rnd * 9.0)) * 0.25, 0.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * uScale / max(-mv.z, 0.001), 1.5, uMax);
    float steady = 0.75 + 0.25 * sin(uShowT * 4.0 + rnd * 40.0);
    float wave = 0.5 + 0.5 * sin(6.2832 * (f * 1.5 - uShowT * 0.35));
    float ring = exp(-4.0 * fract(uBeat * 0.5 - k * 0.14));
    vec3 cSteady = uColA * steady;
    vec3 cWave = mix(uColA, uColB, wave) * (0.6 + 0.6 * wave);
    vec3 cRing = mix(uColB, vec3(1.0), ring * 0.5) * (0.35 + 1.2 * ring);
    vec3 cTorch = vec3(1.0, 0.93, 0.8) * (0.7 + 0.3 * sin(uShowT * 1.5 + rnd * 20.0));
    vColor = cSteady * uMode.x + cWave * uMode.y + cRing * uMode.z + cTorch * uMode.w;
  }`;

const FRAG = /* glsl */ `
  uniform float uOn;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(vColor * 1.4, smoothstep(1.0, 0.25, d) * uOn);
    #include <colorspace_fragment>
  }`;

export type CrowdUniforms = {
  on: { value: number };
  scale: { value: number };
  max: { value: number };
  size: { value: number };
  showT: { value: number };
  beat: { value: number };
  mode: { value: THREE.Vector4 };
  colA: { value: THREE.Color };
  colB: { value: THREE.Color };
};

export function makeCrowdUniforms(): CrowdUniforms {
  return {
    on: { value: 0 },
    scale: { value: 1 },
    max: { value: 64 },
    size: { value: 0.1 },
    showT: { value: 0 },
    beat: { value: 0 },
    mode: { value: new THREE.Vector4(1, 0, 0, 0) },
    colA: { value: new THREE.Color() },
    colB: { value: new THREE.Color() },
  };
}

export function crowdMaterial(u: CrowdUniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uOn: u.on,
      uScale: u.scale,
      uMax: u.max,
      uSize: u.size,
      uShowT: u.showT,
      uBeat: u.beat,
      uMode: u.mode,
      uColA: u.colA,
      uColB: u.colB,
    },
    transparent: true,
    depthWrite: false,
  });
}

/** The crowd on the terraces: loose rows (one in lite), none in the aisles, some seats empty. Venue metres. */
export function crowdGeometry(lite: boolean) {
  const r = rng(29);
  const pos: number[] = [];
  const seat: number[] = [];
  const gap = lite ? 2.4 : 1.15;
  const arc = SEATS_ARC[1] - SEATS_ARC[0];
  for (let k = 0; k < TERRACES; k++) {
    for (const row of lite ? [0.55] : [0.4, 0.78]) {
      const rad = RING_R + (k + row) * TERRACE_D;
      // a raised hand above the terrace
      const y = RING_Y + (k + 1) * TERRACE_H + 1.7;
      const n = Math.round((rad * arc) / gap);
      for (let i = 0; i < n; i++) {
        const a = SEATS_ARC[0] + ((i + 0.5 + (r() - 0.5) * 0.6) / n) * arc;
        if (AISLES.some((x) => Math.abs(a - x) * rad < AISLE_HW + 0.35)) continue;
        if (r() < 0.12) continue;
        pos.push(...polar(rad + (r() - 0.5) * 0.3, a, y + (r() - 0.5) * 0.3));
        seat.push(k, (a - SEATS_ARC[0]) / arc, r(), 0);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aSeat", new THREE.Float32BufferAttribute(seat, 4));
  g.computeBoundingSphere();
  return g;
}
