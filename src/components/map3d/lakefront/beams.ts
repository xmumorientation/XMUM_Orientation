import * as THREE from "three";

import { beams, HAZE } from "./layout";

// DRAFT: the stage's light beams and the haze they light, in one draw call. The beams sweep in the shader (uTime),
// so moving them costs no CPU work. Each beam is a long quad from its
// source along its aim, turned about its axis to face the camera (so it reads as a shaft of light from any side),
// with a bright core, soft edges, and a fade towards its end. Each haze puff is a soft disc facing the camera.
// Additive, so overlapping beams add up where they cross. Attributes are in venue metres (the group's frame).

const VERT = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aDir;
  attribute vec3 aSize;
  attribute vec3 aColor;
  attribute float aKind;
  attribute vec3 aAxis;
  attribute vec3 aSway;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vKind;
  // turns v about the unit axis k by angle a (Rodrigues)
  vec3 turn(vec3 v, vec3 k, float a) {
    float c = cos(a);
    return v * c + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - c);
  }
  void main() {
    vUv = position.xy;
    vColor = aColor;
    vKind = aKind;
    float scale = length(modelMatrix[0].xyz);
    vec3 world;
    if (aKind < 0.5) {
      // a beam: x across (-1..1), y along (0 at the source, 1 at the end); it sweeps (aAxis, aSway)
      vec3 dir = turn(aDir, aAxis, aSway.x * sin(uTime * aSway.y + aSway.z));
      world = (modelMatrix * vec4(aStart + dir * (position.y * aSize.x), 1.0)).xyz;
      vec3 axis = normalize(mat3(modelMatrix) * dir);
      vec3 side = cross(axis, normalize(cameraPosition - world));
      float len = length(side);
      side = len > 1e-4 ? side / len : vec3(1.0, 0.0, 0.0);
      world += side * position.x * mix(aSize.y, aSize.z, position.y) * scale;
    } else {
      // a haze puff: a disc of radius aSize.x facing the camera
      vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      world = (modelMatrix * vec4(aStart, 1.0)).xyz + (right * position.x + up * (position.y * 2.0 - 1.0)) * aSize.x * scale;
    }
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }`;

const FRAG = /* glsl */ `
  uniform float uBeam, uHaze;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vKind;
  void main() {
    float a;
    // clamp before pow(): interpolation can step just past the quad's edge, and pow() of a negative is NaN (bloom
    // would spread it into a black frame)
    if (vKind < 0.5) {
      float across = clamp(1.0 - abs(vUv.x), 0.0, 1.0);
      float core = pow(across, 6.0) * 0.7 + pow(across, 1.6) * 0.45;
      float along = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.35) * smoothstep(0.0, 0.02, vUv.y);
      a = core * along * uBeam;
    } else {
      float d = length(vec2(vUv.x, vUv.y * 2.0 - 1.0));
      a = pow(max(0.0, 1.0 - d), 2.0) * uHaze;
    }
    gl_FragColor = vec4(vColor * a, 1.0);
    #include <colorspace_fragment>
  }`;

export function beamMaterial(u: { beam: { value: number }; haze: { value: number }; time: { value: number } }) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uBeam: u.beam, uHaze: u.haze, uTime: u.time },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** The beams and the haze as one instanced quad. */
export function beamGeometry(lite: boolean) {
  const list = beams(lite);
  const haze = lite ? HAZE.slice(0, 5) : HAZE;
  const n = list.length + haze.length;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const start = new Float32Array(n * 3);
  const dir = new Float32Array(n * 3);
  const size = new Float32Array(n * 3);
  const color = new Float32Array(n * 3);
  const kind = new Float32Array(n);
  const axis = new Float32Array(n * 3);
  const sway = new Float32Array(n * 3);
  const c = new THREE.Color();
  list.forEach((b, i) => {
    start.set(b.p, i * 3);
    dir.set(b.dir, i * 3);
    size.set([b.len, b.w0, b.w1], i * 3);
    axis.set(b.axis, i * 3);
    sway.set(b.sway, i * 3);
    color.set(c.set(b.c).toArray(), i * 3);
  });
  haze.forEach((h, k) => {
    const i = list.length + k;
    start.set(h.p, i * 3);
    size.set([h.r, 0, 0], i * 3);
    color.set(c.set(h.c).toArray(), i * 3);
    kind[i] = 1;
  });
  g.setAttribute("aStart", new THREE.InstancedBufferAttribute(start, 3));
  g.setAttribute("aDir", new THREE.InstancedBufferAttribute(dir, 3));
  g.setAttribute("aSize", new THREE.InstancedBufferAttribute(size, 3));
  g.setAttribute("aColor", new THREE.InstancedBufferAttribute(color, 3));
  g.setAttribute("aKind", new THREE.InstancedBufferAttribute(kind, 1));
  g.setAttribute("aAxis", new THREE.InstancedBufferAttribute(axis, 3));
  g.setAttribute("aSway", new THREE.InstancedBufferAttribute(sway, 3));
  g.instanceCount = n;
  return g;
}
