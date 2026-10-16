import * as THREE from "three";

import { archBeams, beams, fountains, flames, HAZE, lasers, skyBeams, SPOT, type Beam } from "./layout";

// DRAFT: the lake stage's light effects in one draw call: the evening beams and their haze, and for the concert
// the sky beams, the beams under the arch, the lasers, the flame jets, the moat's fountains and the opening's
// follow spot. Each is an instance of one quad:
// - beams and lasers run from their source along their aim, turned about their axis to face the camera (a shaft
//   of light from any side), and sweep in the shader;
// - flames and fountains stand upright, turned to face the camera, and grow to their height;
// - haze puffs are discs facing the camera.
// Additive, so overlaps add up where beams cross. Each instance belongs to a group whose strength is a uniform
// (0 hides the group), so the evening look and the concert share the mesh.

export const KIND = { beam: 0, haze: 1, laser: 2, flame: 3, jet: 4 } as const;
export const GROUP = { beams: 0, haze: 1, live: 2, lasers: 3, flames: 4, jets: 5, spot: 6 } as const;
const GROUPS = 7;

const VERT = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aDir;
  attribute vec3 aSize;
  attribute vec3 aColor;
  attribute vec3 aAxis;
  attribute vec3 aSway;
  attribute vec4 aMeta; // kind, group, palette side (0/1) or fountain phase, spare
  uniform float uGroup[${GROUPS}];
  uniform float uSweep, uAmp, uPan, uShowT, uFlame, uJets, uPx;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vKind;
  varying float vAlt;
  varying float vStrength;
  varying float vThin;
  // turns v about the unit axis k by angle a (Rodrigues)
  vec3 turn(vec3 v, vec3 k, float a) {
    float c = cos(a);
    return v * c + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - c);
  }
  void main() {
    vUv = position.xy;
    vColor = aColor;
    vKind = aMeta.x;
    vAlt = aMeta.z;
    vThin = 1.0;
    vStrength = uGroup[int(aMeta.y + 0.5)];
    if (vStrength < 0.002) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    float scale = length(modelMatrix[0].xyz);
    vec3 world;
    if (vKind < 0.5 || (vKind > 1.5 && vKind < 2.5)) {
      // a beam or a laser: x across (-1..1), y along (0 at the source, 1 at the end); it sweeps (aAxis, aSway),
      // and in the concert's drop it also pans (a figure of eight with the sweep)
      vec3 dir = turn(aDir, aAxis, aSway.x * uAmp * sin(uSweep * aSway.y + aSway.z));
      dir = turn(dir, vec3(0.0, 1.0, 0.0), uPan * sin(uSweep * aSway.y * 1.7 + aSway.z * 1.3));
      world = (modelMatrix * vec4(aStart + dir * (position.y * aSize.x), 1.0)).xyz;
      vec3 axis = normalize(mat3(modelMatrix) * dir);
      vec3 side = cross(axis, normalize(cameraPosition - world));
      float len = length(side);
      side = len > 1e-4 ? side / len : vec3(1.0, 0.0, 0.0);
      // never thinner than about 1.5 pixels (thinner, a laser breaks up into dashes), dimmed to match
      float w = mix(aSize.y, aSize.z, position.y) * scale;
      float wMin = 0.75 * length(cameraPosition - world) / uPx;
      vThin = clamp(w / max(wMin, 1e-6), 0.2, 1.0);
      world += side * position.x * max(w, wMin);
    } else if (vKind > 2.5) {
      // a flame or a fountain: upright, facing the camera, as tall as the show says
      float h = vKind < 3.5 ? uFlame : uJets * (0.72 + 0.28 * sin(uShowT * 5.0 + vAlt * 6.2832));
      world = (modelMatrix * vec4(aStart + vec3(0.0, position.y * aSize.x * max(h, 0.001), 0.0), 1.0)).xyz;
      vec3 side = cross(vec3(0.0, 1.0, 0.0), normalize(cameraPosition - world));
      float len = length(side);
      side = len > 1e-4 ? side / len : vec3(1.0, 0.0, 0.0);
      world += side * position.x * aSize.y * scale * (vKind < 3.5 ? mix(1.0, 0.45, position.y) : mix(0.5, 0.9, position.y));
    } else {
      // a haze puff: a disc of radius aSize.x facing the camera
      vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      world = (modelMatrix * vec4(aStart, 1.0)).xyz + (right * position.x + up * (position.y * 2.0 - 1.0)) * aSize.x * scale;
    }
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }`;

const FRAG = /* glsl */ `
  uniform float uRecolour, uShowT, uPulse;
  uniform vec3 uColA, uColB;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vKind;
  varying float vAlt;
  varying float vStrength;
  varying float vThin;
  void main() {
    // clamp before pow(): interpolation can step just past the quad's edge, and pow() of a negative is NaN (bloom
    // would spread it into a black frame)
    float across = clamp(1.0 - abs(vUv.x), 0.0, 1.0);
    float along = clamp(vUv.y, 0.0, 1.0);
    vec3 show = mix(uColA, uColB, step(0.5, vAlt));
    vec3 col = mix(vColor, show, uRecolour);
    float a;
    if (vKind < 0.5) {
      float core = pow(across, 6.0) * 0.7 + pow(across, 1.6) * 0.45;
      a = core * pow(1.0 - along, 1.35) * smoothstep(0.0, 0.02, along);
    } else if (vKind < 1.5) {
      float d = length(vec2(vUv.x, vUv.y * 2.0 - 1.0));
      a = pow(max(0.0, 1.0 - d), 2.0);
    } else if (vKind < 2.5) {
      // a laser: a hard bright line with a faint glow
      a = (pow(across, 14.0) * 2.2 + pow(across, 2.0) * 0.18) * (1.0 - 0.5 * along);
      col = mix(vColor, show, uRecolour * 0.5);
    } else if (vKind < 3.5) {
      // a flame: white-yellow at the root to orange-red at the tips, flickering, narrowing upwards
      float flick = 0.5 + 0.5 * sin(along * 13.0 - uShowT * 19.0 + vUv.x * 3.0);
      float body = (1.0 - smoothstep(0.45, 1.0, abs(vUv.x) + along * 0.35)) * (1.0 - smoothstep(0.55 + 0.3 * flick, 1.0, along));
      col = mix(vec3(1.0, 0.92, 0.6), vec3(1.0, 0.32, 0.04), along);
      a = body * 1.6;
    } else {
      // a fountain: a white water column, lit from below in the show's colour, with a spray at its top
      float body = (1.0 - smoothstep(0.35, 1.0, abs(vUv.x))) * (1.0 - smoothstep(0.82, 1.0, along));
      col = mix(vec3(0.85, 0.96, 1.0), uColA, 0.35 + 0.3 * (1.0 - along)) * (0.75 + 0.5 * uPulse);
      a = body * 0.9;
    }
    gl_FragColor = vec4(col * a * vStrength * vThin, 1.0);
    #include <colorspace_fragment>
  }`;

export type FxUniforms = {
  group: { value: number[] };
  sweep: { value: number };
  amp: { value: number };
  pan: { value: number };
  showT: { value: number };
  flame: { value: number };
  jets: { value: number };
  recolour: { value: number };
  pulse: { value: number };
  colA: { value: THREE.Color };
  colB: { value: THREE.Color };
  /** Pixels per world unit at distance 1 (drawing buffer). */
  px: { value: number };
};

export function makeFxUniforms(): FxUniforms {
  return {
    group: { value: new Array(GROUPS).fill(0) },
    sweep: { value: 0 },
    amp: { value: 1 },
    pan: { value: 0 },
    showT: { value: 0 },
    flame: { value: 0 },
    jets: { value: 0 },
    recolour: { value: 0 },
    pulse: { value: 0 },
    colA: { value: new THREE.Color("#0dfcfd") },
    colB: { value: new THREE.Color("#3b6cff") },
    px: { value: 1000 },
  };
}

export function fxMaterial(u: FxUniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uGroup: u.group,
      uSweep: u.sweep,
      uAmp: u.amp,
      uPan: u.pan,
      uShowT: u.showT,
      uFlame: u.flame,
      uJets: u.jets,
      uRecolour: u.recolour,
      uPulse: u.pulse,
      uColA: u.colA,
      uColB: u.colB,
      uPx: u.px,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

type Item = { kind: number; group: number; alt: number; b: Beam };

const still = (p: Beam["p"], h: number, w0: number, w1: number, c: string): Beam => ({ p, dir: [0, 1, 0], len: h, w0, w1, c, axis: [0, 1, 0], sway: [0, 0, 0] });

/** Every effect, as one instanced quad. */
export function fxGeometry(lite: boolean) {
  const items: Item[] = [
    ...beams(lite).map((b, i) => ({ kind: KIND.beam, group: GROUP.beams, alt: i % 2, b })),
    ...(lite ? HAZE.slice(0, 5) : HAZE).map((h, i) => ({ kind: KIND.haze, group: GROUP.haze, alt: i % 2, b: still(h.p, h.r, 0, 0, h.c) })),
    ...skyBeams(lite).map((b, i) => ({ kind: KIND.beam, group: GROUP.live, alt: i % 2, b })),
    ...archBeams(lite).map((b, i) => ({ kind: KIND.beam, group: GROUP.live, alt: (i + 1) % 2, b })),
    ...lasers(lite).map((b, i) => ({ kind: KIND.laser, group: GROUP.lasers, alt: i % 2, b })),
    ...flames(lite).map((f) => ({ kind: KIND.flame, group: GROUP.flames, alt: 0, b: still(f.p, f.h, f.w, f.w, "#ffb347") })),
    ...fountains(lite).map((f) => ({ kind: KIND.jet, group: GROUP.jets, alt: f.phase, b: still(f.p, f.h, f.w, f.w, "#dff6ff") })),
    { kind: KIND.beam, group: GROUP.spot, alt: 0, b: SPOT },
  ];
  const n = items.length;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const arrays = {
    aStart: new Float32Array(n * 3),
    aDir: new Float32Array(n * 3),
    aSize: new Float32Array(n * 3),
    aColor: new Float32Array(n * 3),
    aAxis: new Float32Array(n * 3),
    aSway: new Float32Array(n * 3),
    aMeta: new Float32Array(n * 4),
  };
  const c = new THREE.Color();
  items.forEach(({ kind, group, alt, b }, i) => {
    arrays.aStart.set(b.p, i * 3);
    arrays.aDir.set(b.dir, i * 3);
    arrays.aSize.set([b.len, b.w0, b.w1], i * 3);
    arrays.aColor.set(c.set(b.c).toArray(), i * 3);
    arrays.aAxis.set(b.axis, i * 3);
    arrays.aSway.set(b.sway, i * 3);
    arrays.aMeta.set([kind, group, alt, 0], i * 4);
  });
  for (const [name, arr] of Object.entries(arrays)) {
    g.setAttribute(name, new THREE.InstancedBufferAttribute(arr, name === "aMeta" ? 4 : 3));
  }
  g.instanceCount = n;
  return g;
}
