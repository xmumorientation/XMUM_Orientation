import * as THREE from "three";

import { VX } from "../common";

// DRAFT: the East zone's kit, style B "Retro Carnival" (funfair-lab/styleB.tsx)
// brightened for day: red and cream stripes, gold trim, warm marquee bulbs,
// with Vortexa yellow as the zone's neon. Modelled in metres: x north, y up,
// z east (the zone group is scaled by UNITS_PER_M). Static pieces are baked
// with central/kit's Bake into a few merged meshes; bulbs are instanced.
//
// The power look is West's (west/kit.ts), so the zones match:
// - paint: `uFade` (1 = off) takes most of the colour out;
// - lights: tubes and bulbs share one material. Each vertex or instance has
//   `aTS` = (threshold, seed) and switches on once the zone's power passes its
//   threshold. A tube (seed < 0) stays steady and, dead, is light grey glass;
//   a bulb (seed >= 0) chases and, dead, is dark glass.

/** Paint: style B's colours, lifted so they read from far away by day. */
export const PAINT = {
  red: "#e3263a",
  redDeep: "#b51d2f",
  cream: "#fff2d8",
  ivory: "#fffaf0",
  gold: "#f0b93a",
  goldDeep: "#c99528",
  teal: "#1fa59e",
  navy: "#21528c",
  plum: "#8a62b4",
  plumDark: "#5a4380",
  slate: "#4d4763",
  wood: "#c98d55",
  woodDark: "#8a5a35",
  deck: "#ead2aa",
  iron: "#4a4552",
  stone: "#d4ccc0",
  white: "#f7f4ee",
  black: "#2a2530",
  pink: "#ff5fbf",
  cyan: "#3fd8e6",
  lilac: "#cfa8f5",
  yellow: "#f6ea3a",
  orange: "#ff9f43",
  leaf: "#5aa63f",
  leafDark: "#3f8a33",
  trunk: "#7a5236",
} as const;

/** Neon and bulb colours: the Vortexa palette and the warm marquee bulb. East's own accent is yellow. */
export const NEON = {
  yellow: VX.yellow,
  pink: VX.pink,
  cyan: VX.cyan,
  lilac: VX.lilac,
  orange: VX.orange,
  warm: "#ffc978",
  white: "#fff3dc",
} as const;

const ACCENT = [VX.yellow, VX.pink, VX.cyan];
/** Mostly warm marquee bulbs, every fourth one a Vortexa accent (style B). */
export const bulbC = (i: number) => (i % 4 === 3 ? ACCENT[(i >> 2) % 3] : NEON.warm);
/** The same pattern as a list (bulb strings cycle through it). */
export const MARQUEE: string[] = Array.from({ length: 12 }, (_, i) => bulbC(i));

// ---------- materials ----------

export type Uniform<T> = { value: T };

function glowTexture() {
  const s = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d")!;
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.4, "rgba(255,255,255,0.42)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type LightUniforms = { p: Uniform<number>; on: Uniform<number>; time: Uniform<number>; flick: Uniform<number>; chase: Uniform<number> };

/** Tubes and bulbs (west/kit.ts's light material, under East's own program key). */
function lightMaterial(u: LightUniforms, key: string) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0, toneMapped: false });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uP: u.p, uOn: u.on, uTime: u.time, uFlick: u.flick, uChase: u.chase });
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aTS;\nvarying vec2 vTS;")
      .replace("#include <color_vertex>", "#include <color_vertex>\nvTS = aTS;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uP, uOn, uTime, uFlick, uChase;\nvarying vec2 vTS;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float lit = smoothstep(vTS.x, vTS.x + 0.04, uP);
        float hz = fract(sin(vTS.y * 91.7 + floor(uTime * 15.0) * 1.37) * 43758.5);
        lit *= mix(1.0, step(0.4, hz), uFlick * step(0.001, lit));
        float bulbK = step(0.0, vTS.y);
        float chase = 1.0 - uChase * bulbK * 0.45 * step(0.66, fract(vTS.y / 3.0 - uTime * 1.6));
        vec3 deadTube = mix(vec3(0.62, 0.63, 0.68), diffuseColor.rgb, 0.16);
        vec3 deadBulb = mix(vec3(0.06, 0.06, 0.075), diffuseColor.rgb, 0.07);
        totalEmissiveRadiance = diffuseColor.rgb * uOn * chase * lit;
        diffuseColor.rgb = mix(deadTube, deadBulb, bulbK) * (1.0 - lit);`,
      );
  };
  m.customProgramCacheKey = () => key;
  return m;
}

export function makeEastKit() {
  const u = {
    /** 1 = powered off (paint loses its colour). */
    fade: { value: 1 } as Uniform<number>,
    /** The shown power, 0..1: lights compare it with their thresholds. */
    p: { value: 0 } as Uniform<number>,
    /** Brightness of a lit light (higher at night). */
    on: { value: 1.35 } as Uniform<number>,
    time: { value: 0 } as Uniform<number>,
    /** 1 while powering up in full mode: lights flicker as they catch. */
    flick: { value: 0 } as Uniform<number>,
    /** Bulbs chase (a running dim wave). */
    chase: { value: 1 } as Uniform<number>,
  };

  // Painted wood, canvas and steel: matte, so the stripes stay bright by day.
  const frame = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.04 });
  frame.onBeforeCompile = (s) => {
    s.uniforms.uFade = u.fade;
    s.fragmentShader =
      "uniform float uFade;\n" +
      s.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float fadeL = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(fadeL) * vec3(0.93, 0.93, 0.98) + 0.02, uFade * 0.7) * (1.0 - 0.08 * uFade);`,
      );
  };
  frame.customProgramCacheKey = () => "fz-east-frame";

  // Ground paving: never fades. Pulled towards the camera a touch so it never fights the lawn.
  const paving = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.92,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });

  const light = lightMaterial(u, "fz-east-light");

  const glow = glowTexture();
  const pool = new THREE.MeshBasicMaterial({
    map: glow,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const halo = new THREE.SpriteMaterial({
    map: glow,
    color: "#ff2020",
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const standby = new THREE.MeshBasicMaterial({ color: "#ff2020", toneMapped: false });
  const spark = new THREE.MeshBasicMaterial({ color: "#fff6b0", toneMapped: false });
  // the Big Top's searchlights: vertex colours fade them out along their length (additive: black is invisible)
  const beam = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  return { u, frame, paving, light, pool, halo, standby, spark, beam, glow };
}
export type EastKit = ReturnType<typeof makeEastKit>;

export function disposeEastKit(k: EastKit) {
  for (const m of [k.frame, k.paving, k.light, k.pool, k.halo, k.standby, k.spark, k.beam]) m.dispose();
  k.glow.dispose();
}
