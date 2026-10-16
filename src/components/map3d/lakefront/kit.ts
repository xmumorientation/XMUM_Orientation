import * as THREE from "three";

import { VX } from "../funfair/common";
import { beamMaterial } from "./beams";
import { LIGHT, PAINT } from "./build";
import { SLATS_PER_BAY } from "./layout";

// DRAFT: the LakeFront Café's materials, and its standby lighting (sunset and night, no concert): the ribs are LED
// lines, the membrane under the shell is washed with soft colour, uplights warm the shell's outside from below,
// and small lights (bulbs, dots, step lights, terrace strips) and light pools on the deck and the water come on.
// All of it is static (uniforms set when the look changes), so a map that draws on demand pays nothing for it.
//
// The shell's skin is one double-sided surface: outside, thin red slats over the white membrane (anti-aliased, so
// far away they blend to the photos' pinkish red instead of shimmering); inside, the white membrane.

/** Share of each slat period that is red. */
const DUTY = 0.64;

type Uniform<T> = { value: T };
const color = (c: string): Uniform<THREE.Color> => ({ value: new THREE.Color(c) });
const num = (v: number): Uniform<number> => ({ value: v });

function makeUniforms() {
  return {
    /** The ribs' LED lines: brightness, and their colour at the feet and at the top. */
    led: num(0),
    foot: color("#ffffff"),
    top: color("#ffffff"),
    /** The membrane's wash (inside the shell): brightness, colour low down and high up. */
    wash: num(0),
    washLow: color("#ffffff"),
    washHigh: color("#ffffff"),
    /** Uplights on the shell's outside, strongest near the ground. */
    up: num(0),
    upColor: color("#ffffff"),
    /** The small lights' brightness (0 = off: they show as fixtures). */
    on: num(0),
    /** The beams' and the haze's strength (beams.ts). */
    beam: num(0),
    haze: num(0),
    /** Seconds on the wall clock (within the hour), so every map sweeps its beams in step. */
    time: num(0),
  };
}
type Uniforms = ReturnType<typeof makeUniforms>;

/** The ribs' steel: red, and at night an LED line that runs from the feet's colour to the top's. */
function steelMaterial(u: Uniforms) {
  const m = new THREE.MeshStandardMaterial({ color: PAINT.red, roughness: 0.36, metalness: 0.25 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uLed: u.led, uFoot: u.foot, uTop: u.top });
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aLed;\nvarying vec2 vLed;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLed = aLed;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uLed;\nuniform vec3 uFoot, uTop;\nvarying vec2 vLed;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        // max(): at the feet sin() can dip just below 0, and pow() of a negative is NaN (bloom spreads it to a black frame)
        if (vLed.y > -0.5) totalEmissiveRadiance += mix(uFoot, uTop, pow(max(sin(3.14159 * vLed.x), 0.0), 1.4)) * uLed;`,
      );
  };
  m.customProgramCacheKey = () => "lakefront-steel";
  return m;
}

function shellMaterial(u: Uniforms) {
  const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.55, metalness: 0.04, side: THREE.DoubleSide });
  const own = { uSlat: color(PAINT.red), uSkin: color("#f3f0ea") };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, own, {
      uWash: u.wash,
      uWashLow: u.washLow,
      uWashHigh: u.washHigh,
      uUp: u.up,
      uUpColor: u.upColor,
    });
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aShell;\nvarying vec2 vShell;\nvarying float vY;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvShell = aShell;\nvY = position.y;");
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 uSlat, uSkin, uWashLow, uWashHigh, uUpColor;\nuniform float uWash, uUp;\nvarying vec2 vShell;\nvarying float vY;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float slatX = vShell.y * ${(6 * SLATS_PER_BAY).toFixed(1)};
        float slatW = fwidth(slatX);
        float slat = 1.0 - smoothstep(${(DUTY / 2).toFixed(3)} - slatW, ${(DUTY / 2).toFixed(3)} + slatW, abs(fract(slatX) - 0.5));
        slat = mix(slat, ${DUTY.toFixed(3)}, smoothstep(0.3, 0.8, slatW));
        diffuseColor.rgb = gl_FrontFacing ? mix(uSkin, uSlat, slat) : uSkin;
        // inside: the membrane's wash, strongest low down; outside: uplights from the ground
        float washH = clamp((vY - 2.0) / 20.0, 0.0, 1.0);
        vec3 shellGlow = gl_FrontFacing
          ? uUpColor * uUp * (0.3 + 0.7 * (1.0 - smoothstep(2.0, 13.0, vY)))
          : mix(uWashLow, uWashHigh, washH) * uWash * (1.0 - 0.6 * washH);`,
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n        totalEmissiveRadiance += shellGlow;");
  };
  m.customProgramCacheKey = () => "lakefront-shell";
  return m;
}

/**
 * The small lights (build.ts bakeLights). Lit, each glows in its vertex colour (bloom picks it up at night). Off,
 * it is a pale fixture shaded like any surface; a terrace strip is then the terrace's own colour, so it vanishes.
 */
function lightMaterial(u: Uniforms) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uOn: u.on, uRiser: color(PAINT.riser) });
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aTS;\nvarying vec2 vTS;")
      .replace("#include <color_vertex>", "#include <color_vertex>\nvTS = aTS;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uOn;\nuniform vec3 uRiser;\nvarying vec2 vTS;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float kind = vTS.x;
        float gain = kind < ${LIGHT.dot - 0.5} ? 1.0 : kind < ${LIGHT.step - 0.5} ? 0.9 : kind < ${LIGHT.riser - 0.5} ? 0.75 : 0.42;
        totalEmissiveRadiance = diffuseColor.rgb * uOn * gain;
        vec3 dead = kind < ${LIGHT.riser - 0.5} ? vec3(0.82, 0.82, 0.8) : uRiser;
        diffuseColor.rgb = dead * (1.0 - 0.5 * clamp(uOn, 0.0, 1.0));`,
      );
  };
  m.customProgramCacheKey = () => "lakefront-light";
  return m;
}

/** A soft white spot (light pools take their colour per instance). */
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

export function makeKit() {
  const u = makeUniforms();
  const glow = glowTexture();
  return {
    u,
    glow,
    venue: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 }),
    steel: steelMaterial(u),
    shell: shellMaterial(u),
    lights: lightMaterial(u),
    beams: beamMaterial(u),
    // like the lake (water.tsx)
    water: new THREE.MeshStandardMaterial({
      color: "#8fd3f2",
      transparent: true,
      opacity: 0.62,
      roughness: 0.16,
      metalness: 0.1,
      envMapIntensity: 1.4,
    }),
    pool: new THREE.MeshBasicMaterial({
      map: glow,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  };
}
export type Kit = ReturnType<typeof makeKit>;

export function disposeKit(k: Kit) {
  for (const m of [k.venue, k.steel, k.shell, k.lights, k.beams, k.water, k.pool]) m.dispose();
  k.glow.dispose();
}

/**
 * The standby looks. Night: the ribs run from cyan at the feet to lilac at the top, the membrane is washed pink to
 * violet, the shell's red glows from below. Sunset: the same, warm and softer. Day: all off.
 * `pool`, `beam` and `haze` are [full, lite]: the light pools' opacity, the beams' and the haze's strength (lite has
 * no bloom or point lights, so its pools and beams are stronger).
 */
const LOOKS = {
  day: { led: 0, foot: "#ffffff", top: "#ffffff", wash: 0, washLow: "#ffffff", washHigh: "#ffffff", up: 0, upColor: "#ffffff", on: 0, pool: [0, 0], beam: [0, 0], haze: [0, 0] },
  sunset: {
    led: 0.3,
    foot: "#ff9a5a",
    top: "#ffc890",
    wash: 0.32,
    washLow: "#ffcf9a",
    washHigh: "#ff9476",
    up: 0.12,
    upColor: "#ff6a4a",
    on: 0.9,
    pool: [0.14, 0.42],
    beam: [0.16, 0.26],
    haze: [0.04, 0.06],
  },
  night: {
    led: 1.3,
    foot: VX.cyan,
    top: VX.lilac,
    wash: 0.5,
    washLow: "#f2a6e6",
    washHigh: "#6c4bd6",
    up: 0.3,
    upColor: "#ff3a5c",
    on: 2,
    pool: [0.5, 0.7],
    beam: [0.7, 0.8],
    haze: [0.16, 0.2],
  },
} as const;
export type Look = keyof typeof LOOKS;

/** Sets the standby look on the kit's uniforms. */
export function applyLook(k: Kit, look: Look, lite: boolean) {
  const l = LOOKS[look];
  const u = k.u;
  u.led.value = l.led;
  u.foot.value.set(l.foot);
  u.top.value.set(l.top);
  u.wash.value = l.wash;
  u.washLow.value.set(l.washLow);
  u.washHigh.value.set(l.washHigh);
  u.up.value = l.up;
  u.upColor.value.set(l.upColor);
  u.on.value = l.on;
  k.pool.opacity = l.pool[lite ? 1 : 0];
  u.beam.value = l.beam[lite ? 1 : 0];
  u.haze.value = l.haze[lite ? 1 : 0];
}
