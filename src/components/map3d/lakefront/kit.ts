import * as THREE from "three";

import { VX } from "../funfair/common";
import { LIGHT, PAINT } from "./build";
import { fxMaterial, makeFxUniforms } from "./fx";
import { SLATS_PER_BAY } from "./layout";

// DRAFT: the LakeFront Café's materials, its evening lighting and its concert lighting.
//
// Evening (sunset and night, no concert): the ribs are LED lines, the membrane under the shell is washed with soft
// colour, uplights warm the shell's outside from below, and small lights (bulbs, dots, step lights, terrace strips)
// and light pools come on. Static, set when the look changes.
//
// Concert (show.ts, set every frame): the evening light dims (`dim`; LakefrontStage holds it at 1, so the stage
// is dark until the finale), the ribs light one by one (`ribs`), then the
// show takes over (`live`): the ribs chase, step and pulse on the beat, the shell's outside is an LED screen
// (a sweep, an equaliser, rings from the arch, the beat), the membrane pulses, the terrace strips ripple outwards
// from the stage and the walkway's dots chase round, all in the show's two colours.
//
// The shell's skin is one double-sided surface: outside, thin red slats over the white membrane (anti-aliased, so
// far away they blend to the photos' pinkish red instead of shimmering); inside, the white membrane.
//
// Watch out: clamp before pow() in these shaders. A NaN from pow() of a tiny negative spreads through the bloom
// into a black frame.

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
    // ── the concert ──
    /** The evening light dimmed for the concert (0..1), the ribs lit so far in the opening (0..7), the show (0..1). */
    dim: num(0),
    ribs: num(0),
    live: num(0),
    colA: color(VX.cyan),
    colB: color(VX.pink),
    pulse: num(0),
    beat: num(0),
    showT: num(0),
    energy: num(0),
    flash: num(0),
    /** The shell's patterns: chase, equaliser, beat pulse, breathing. */
    mix: { value: new THREE.Vector4(1, 0, 0, 0) } as Uniform<THREE.Vector4>,
  };
}
type Uniforms = ReturnType<typeof makeUniforms>;

const LIVE_DECL = "uniform float uDim, uRibs, uLive, uPulse, uBeat, uShowT, uEnergy, uFlash;\nuniform vec4 uMix;\nuniform vec3 uColA, uColB;";
const liveUniforms = (u: Uniforms) => ({
  uDim: u.dim,
  uRibs: u.ribs,
  uLive: u.live,
  uPulse: u.pulse,
  uBeat: u.beat,
  uShowT: u.showT,
  uEnergy: u.energy,
  uFlash: u.flash,
  uMix: u.mix,
  uColA: u.colA,
  uColB: u.colB,
});

/** The ribs' steel: red; in the evening an LED line from the feet's colour to the top's; in the concert, the show. */
function steelMaterial(u: Uniforms) {
  const m = new THREE.MeshStandardMaterial({ color: PAINT.red, roughness: 0.36, metalness: 0.25 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uLed: u.led, uFoot: u.foot, uTop: u.top }, liveUniforms(u));
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aLed;\nvarying vec2 vLed;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLed = aLed;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uLed;\nuniform vec3 uFoot, uTop;\n${LIVE_DECL}\nvarying vec2 vLed;`)
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        if (vLed.y > -0.5) {
          float rib = vLed.y;
          float apex = pow(max(sin(3.14159 * vLed.x), 0.0), 1.4);
          vec3 evening = mix(uFoot, uTop, apex) * uLed * (1.0 - uDim);
          // the opening: each rib comes on in white, from the front arch back
          vec3 opening = vec3(1.5) * step(rib + 0.5, uRibs) * (1.0 - uLive);
          // the show: bands climbing from the feet, ribs stepping on through the beats, the beat, breathing
          float fromFoot = 1.0 - abs(vLed.x - 0.5) * 2.0;
          float chase = pow(clamp(fract(fromFoot * 1.5 - uShowT * 0.9 + rib * 0.11), 0.0, 1.0), 6.0);
          float stepping = exp(-mod(uBeat - rib, 7.0) * 0.9);
          float beat = 0.25 + 0.75 * uPulse;
          float breathe = 0.45 + 0.35 * sin(uShowT * 1.3 + rib * 0.6);
          float k = uMix.x * chase + uMix.y * stepping + uMix.z * beat + uMix.w * breathe;
          vec3 c = mix(uColA, uColB, mod(rib + floor(uBeat), 2.0));
          vec3 show = c * (0.25 + 1.7 * k) * (0.6 + 0.6 * uEnergy);
          totalEmissiveRadiance += evening + opening + show * uLive + vec3(1.6) * uFlash;
        }`,
      );
  };
  m.customProgramCacheKey = () => "lakefront-steel";
  return m;
}

function shellMaterial(u: Uniforms) {
  const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.55, metalness: 0.04, side: THREE.DoubleSide });
  const own = { uSlat: color(PAINT.red), uSkin: color("#f3f0ea") };
  m.onBeforeCompile = (s) => {
    Object.assign(
      s.uniforms,
      own,
      { uWash: u.wash, uWashLow: u.washLow, uWashHigh: u.washHigh, uUp: u.up, uUpColor: u.upColor },
      liveUniforms(u),
    );
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aShell;\nvarying vec2 vShell;\nvarying float vY;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvShell = aShell;\nvY = position.y;");
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nuniform vec3 uSlat, uSkin, uWashLow, uWashHigh, uUpColor;\nuniform float uWash, uUp;\n${LIVE_DECL}\nvarying vec2 vShell;\nvarying float vY;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float slatX = vShell.y * ${(6 * SLATS_PER_BAY).toFixed(1)};
        float slatW = fwidth(slatX);
        float slat = 1.0 - smoothstep(${(DUTY / 2).toFixed(3)} - slatW, ${(DUTY / 2).toFixed(3)} + slatW, abs(fract(slatX) - 0.5));
        slat = mix(slat, ${DUTY.toFixed(3)}, smoothstep(0.3, 0.8, slatW));
        diffuseColor.rgb = gl_FrontFacing ? mix(uSkin, uSlat, slat) : uSkin;
        // evening: inside, the membrane's wash, strongest low down; outside, uplights from the ground
        float washH = clamp((vY - 2.0) / 20.0, 0.0, 1.0);
        vec3 shellGlow = (gl_FrontFacing
          ? uUpColor * uUp * (0.3 + 0.7 * (1.0 - smoothstep(2.0, 13.0, vY)))
          : mix(uWashLow, uWashHigh, washH) * uWash * (1.0 - 0.6 * washH)) * (1.0 - uDim);
        // the concert. Outside, an LED screen over (along the span, front to back): a band sweeping along the
        // span, equaliser bars growing back from the front arch, rings out from the top of the arch, the beat.
        float bar = floor(vShell.x * 18.0);
        float level = fract(sin(bar * 12.9898 + floor(uBeat) * 78.233) * 43758.5453) * (0.35 + 0.65 * uEnergy);
        float eq = step(vShell.y, level) * step(0.1, fract(vShell.x * 18.0)) * (0.55 + 0.45 * uPulse);
        float ringD = length(vec2((vShell.x - 0.5) * 2.0, vShell.y));
        float rings = pow(clamp(sin((ringD * 3.0 - uShowT * 2.2) * 6.2832), 0.0, 1.0), 8.0);
        float sweepD = (vShell.x - (0.5 + 0.48 * sin(uShowT * 1.4))) * 7.0;
        float sweep = exp(-sweepD * sweepD);
        float breathe = 0.35 + 0.25 * sin(uShowT * 1.3);
        float k = uMix.x * sweep + uMix.y * eq + uMix.z * (rings * 0.6 + uPulse * 0.5) + uMix.w * breathe;
        vec3 screen = mix(uColA, uColB, vShell.y) * (0.15 + 1.4 * k) * (0.5 + 0.5 * uEnergy);
        // inside, the membrane pulses with the beat
        vec3 membrane = mix(uColA, uColB, washH) * (0.4 + 0.8 * uPulse) * (0.5 + 0.5 * uEnergy);
        shellGlow += (gl_FrontFacing ? screen : membrane) * uLive + vec3(1.2) * uFlash;`,
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n        totalEmissiveRadiance += shellGlow;");
  };
  m.customProgramCacheKey = () => "lakefront-shell";
  return m;
}

/**
 * The small lights (build.ts bakeLights). Lit, each glows in its vertex colour (bloom picks it up at night). Off,
 * it is a pale fixture shaded like any surface; a terrace strip is then the terrace's own colour, so it vanishes.
 * In the concert the terrace strips ripple outwards from the stage on the beat and the walkway's dots chase round.
 */
function lightMaterial(u: Uniforms) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uOn: u.on, uRiser: color(PAINT.riser) }, liveUniforms(u));
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aTS;\nvarying vec2 vTS;")
      .replace("#include <color_vertex>", "#include <color_vertex>\nvTS = aTS;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uOn;\nuniform vec3 uRiser;\n${LIVE_DECL}\nvarying vec2 vTS;`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float kind = vTS.x;
        float gain = kind < ${LIGHT.dot - 0.5} ? 1.0 : kind < ${LIGHT.step - 0.5} ? 0.9 : kind < ${LIGHT.riser - 0.5} ? 0.75 : 0.42;
        vec3 evening = diffuseColor.rgb * uOn * gain * (1.0 - uDim);
        float terrace = floor(vTS.y);
        float ripple = exp(-3.5 * fract(uBeat * 0.5 - terrace * 0.14));
        float chase = step(0.55, fract(vTS.y * 20.0 - uShowT * 1.6));
        vec3 show = kind > ${LIGHT.riser - 0.5}
          ? mix(uColA, uColB, mod(terrace, 2.0)) * (0.15 + 2.0 * ripple)
          : kind > ${LIGHT.dot - 0.5} && kind < ${LIGHT.step - 0.5}
            ? uColB * (0.2 + 2.0 * chase)
            : diffuseColor.rgb * uOn * gain * (0.8 + 0.5 * uPulse);
        totalEmissiveRadiance = mix(evening, show, uLive);
        float lit = max(uOn * (1.0 - uDim), uLive);
        vec3 dead = kind < ${LIGHT.riser - 0.5} ? vec3(0.82, 0.82, 0.8) : uRiser;
        diffuseColor.rgb = dead * (1.0 - 0.5 * clamp(lit, 0.0, 1.0));`,
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
  const fx = makeFxUniforms();
  const glow = glowTexture();
  return {
    u,
    fx,
    glow,
    /** The evening look's levels for this frame's mix (applyLook). */
    evening: { beam: 0, haze: 0, pool: 0 },
    venue: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 }),
    steel: steelMaterial(u),
    shell: shellMaterial(u),
    lights: lightMaterial(u),
    fxMat: fxMaterial(fx),
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
  for (const m of [k.venue, k.steel, k.shell, k.lights, k.fxMat, k.water, k.pool]) m.dispose();
  k.glow.dispose();
}

/**
 * The evening looks. Night: the ribs run from cyan at the feet to lilac at the top, the membrane is washed pink to
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

/** Sets the evening look on the kit's uniforms (the concert mixes over it every frame). */
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
  k.evening.pool = l.pool[lite ? 1 : 0];
  k.evening.beam = l.beam[lite ? 1 : 0];
  k.evening.haze = l.haze[lite ? 1 : 0];
}

/**
 * How strong each part of the concert is in each look (multiplies show.ts). By day the beams, lasers and haze
 * hardly show against the sunlit ground; the shell's screen, the flames, the fountains and the confetti carry it.
 */
export const CONCERT = {
  day: { beams: 0.35, haze: 0, sky: 0.15, lasers: 0.3, flames: 1, jets: 1, spot: 0.6, screen: 0.85, crowd: 0.85, fireworks: 0.55, pool: 0.15 },
  sunset: { beams: 0.65, haze: 0.08, sky: 0.5, lasers: 0.65, flames: 1, jets: 1, spot: 0.85, screen: 0.95, crowd: 0.9, fireworks: 0.8, pool: 0.3 },
  night: { beams: 0.9, haze: 0.18, sky: 0.9, lasers: 1, flames: 1, jets: 1, spot: 1, screen: 1, crowd: 1, fireworks: 1, pool: 0.55 },
} as const;
