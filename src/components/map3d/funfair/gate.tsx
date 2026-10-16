"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { UNITS_PER_M } from "../geo";
import { Bake, lightBake, mat, smooth, type V3 } from "./central/kit";
import { LITE_SELF_LIT, usePowerRamp, VX, type ZoneProps } from "./common";
import { glowStrength, LiteGlow, type GlowSpot } from "./glow";
import { NEON, S, STEEL, bar, disposeWestKit, makeWestKit, tube } from "./west/kit";

// DRAFT: the VORTEXA neon gate (docs/map3d-funfair-design.md), shared by all
// zones, in the Neon Cyber style (style A bench, in git history at 4eee382) brightened for day.
// It stands at the south end of Central's midway and faces the lake park: two
// tapered white pillars with neon corners, a sign board with "VORTEXA" in
// yellow neon (cyan and pink outlines), a holo arch over it, bulb rows.
//
// `power` is the share of zones powered (0, 1/3, 2/3, 1), and the gate lights
// in proportion: a third lights the pillars and the lower bulbs, two thirds
// the letters, all three the holo arch and the top bulbs; at 1 (the finale)
// everything glows stronger. Modelled in metres: x across the midway, y up,
// z towards the park (the group turns it so). Three meshes: the frame (with
// its shadow), the lights, and one additive mesh for the sign's glow and the
// light pools on the ground.

/** Where the gate stands (world x, z): the midway's south end. */
export const GATE_POS: [number, number] = [20.0, -11.5];

/** The pillars' centres (either side of the 13 m midway), their height, and the sign's middle height. */
const PX = 8.7;
const PH = 11;
const SIGN_Y = 8.6;

// Thresholds of the three bands (the power is 0, 1/3, 2/3 or 1; a light needs power >= t + 0.04).
const B1: [number, number] = [0.02, 0.28];
const B2: [number, number] = [0.38, 0.6];
const B3: [number, number] = [0.7, 0.94];
const band = ([a, b]: [number, number], f: number) => a + (b - a) * Math.min(1, Math.max(0, f));

/** Flat-shaded, non-indexed pieces for baking: a tapered square pillar (top 1, bottom 1.55) and its pyramid cap. */
function flat(g: THREE.BufferGeometry) {
  const n = g.toNonIndexed();
  g.dispose();
  n.deleteAttribute("uv");
  n.computeVertexNormals();
  return n;
}
const PILLAR = flat(new THREE.CylinderGeometry(1.0, 1.55, 1, 4));
const PYRAMID = flat(new THREE.ConeGeometry(1, 1, 4));

/** Neon letter strokes (a unit letter is 1 wide and 1.4 tall). */
const LETTERS: Record<string, [number, number][][]> = (() => {
  const p = (...xy: number[]) => {
    const out: [number, number][] = [];
    for (let i = 0; i < xy.length; i += 2) out.push([xy[i], xy[i + 1]]);
    return out;
  };
  const oval: [number, number][] = Array.from({ length: 19 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2;
    return [0.5 + Math.sin(a) * 0.5, 0.7 + Math.cos(a) * 0.7];
  });
  return {
    V: [p(0, 1.4, 0.5, 0, 1, 1.4)],
    O: [oval],
    R: [p(0, 0, 0, 1.4, 0.62, 1.4, 0.9, 1.27, 0.97, 1.05, 0.9, 0.84, 0.62, 0.72, 0, 0.72), p(0.45, 0.72, 1, 0)],
    T: [p(0, 1.4, 1, 1.4), p(0.5, 1.4, 0.5, 0)],
    E: [p(1, 1.4, 0, 1.4, 0, 0, 1, 0), p(0, 0.72, 0.78, 0.72)],
    X: [p(0, 1.4, 1, 0), p(0, 0, 1, 1.4)],
    A: [p(0, 0, 0.5, 1.4, 1, 0), p(0.2, 0.52, 0.8, 0.52)],
  };
})();

/** The website's holo gradient (cyan, lilac, pink, orange), t in 0..1. */
const HOLO = [VX.cyan, VX.lilac, VX.pink, VX.orange].map((c) => new THREE.Color(c));
function holo(t: number) {
  const x = Math.min(0.999, Math.max(0, t)) * (HOLO.length - 1);
  const i = Math.floor(x);
  return HOLO[i].clone().lerp(HOLO[i + 1], x - i);
}

function buildGate(lite: boolean) {
  const fr = new Bake();
  const li = lightBake(lite);
  let seed = 0;
  const bulb = (q: V3, r: number, c: THREE.ColorRepresentation, t: number) => {
    if (lite && seed % 2) {
      seed++;
      return;
    }
    li.add(S.bulb, mat(q[0], q[1], q[2], r), c, t, seed++);
  };

  // the pillars: plinth, tapered white tower, pink cap, yellow ball; neon on all four corners, chevrons front and back
  for (const x of [-PX, PX]) {
    const side = Math.sign(x);
    fr.box(STEEL.silver, [x, 0.3, 0], [3.4, 0.6, 3.4]);
    fr.box(STEEL.pink, [x, 0.66, 0], [3.0, 0.12, 3.0]);
    fr.add(PILLAR, mat(x, 0.6 + (PH - 0.6) / 2, 0, 1, PH - 0.6, 1, Math.PI / 4), STEEL.white);
    fr.add(PYRAMID, mat(x, PH + 0.7, 0, 1.05, 1.4, 1.05, Math.PI / 4), STEEL.pink);
    li.add(S.ball, mat(x, PH + 1.75, 0, 0.42), NEON.yellow, B3[1], -1);
    for (const fz of [1, -1]) {
      for (const cx of [-1, 1]) {
        const inner = cx === -side;
        const a: V3 = [x + cx * 1.12, 0.75, fz * 1.12];
        const b: V3 = [x + cx * 0.74, PH - 0.1, fz * 0.74];
        const pts: V3[] = Array.from({ length: 6 }, (_, i) => {
          const u = i / 5;
          return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
        });
        tube(li, pts, 0.08, inner ? NEON.cyan : NEON.pink, (i) => band(B1, i / 5), 10 + cx * 3 + fz, false, false, S.tube4);
        // bulbs up the outer corners
        if (!inner)
          for (let k = 1; k < 12; k++) {
            const u = k / 12;
            bulb([a[0] + (b[0] - a[0]) * u + cx * 0.2, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u + fz * 0.2], 0.17, k % 2 ? NEON.warm : NEON.yellow, band(B1, u));
          }
      }
      for (let k = 0; k < 3; k++) {
        const y = 2.0 + k * 1.35;
        const hw = 1.45 - (y / PH) * 0.5;
        const z = fz * (hw + 0.04);
        tube(li, [[x - hw * 0.7, y + 0.6, z], [x, y, fz * (hw + 0.06)], [x + hw * 0.7, y + 0.6, z]], 0.07, NEON.lilac, band(B1, 0.3 + k * 0.2), 30 + k, false, true, S.tube4);
      }
    }
  }

  // the sign board between the pillars, with pink trims
  const BW = 2 * PX - 1.4;
  fr.box(STEEL.silver, [0, SIGN_Y, 0], [BW, 3.0, 1.1]);
  fr.box(STEEL.pink, [0, SIGN_Y + 1.65, 0], [BW + 0.4, 0.3, 1.4]);
  fr.box(STEEL.pink, [0, SIGN_Y - 1.65, 0], [BW + 0.4, 0.3, 1.4]);
  // "VORTEXA" on both faces (mirrored on the back so it reads from the midway too):
  // yellow tubes, a cyan outline offset up-left and a pink one down-right, just behind
  const word = "VORTEXA";
  const LH = 1.9 / 1.4;
  const lw = LH;
  const gap = 0.5;
  const total = word.length * lw + (word.length - 1) * gap;
  word.split("").forEach((ch, i) => {
    const x0 = -total / 2 + i * (lw + gap);
    const t = band(B2, i / (word.length - 1));
    for (const fz of [1, -1]) {
      for (const stroke of LETTERS[ch]) {
        const pts = (dx: number, dy: number, dz: number) =>
          stroke.map(([sx, sy]) => [fz * (x0 + sx * LH + dx), SIGN_Y - 0.95 + sy * LH + dy, fz * (0.62 + dz)] as V3);
        tube(li, pts(0, 0, 0), 0.13, NEON.yellow, t, 100 + i * 7, false, true, S.tube6);
        tube(li, pts(-0.12, 0.1, -0.07), 0.065, NEON.cyan, t + 0.02, 200 + i * 7, false, false, S.tube4);
        tube(li, pts(0.12, -0.1, -0.07), 0.065, NEON.pink, t + 0.02, 300 + i * 7, false, false, S.tube4);
      }
    }
  });
  for (const fz of [1, -1]) {
    tube(li, [[-total / 2 - 0.3, SIGN_Y - 1.2, fz * 0.6], [total / 2 + 0.3, SIGN_Y - 1.2, fz * 0.6]], 0.06, NEON.orange, B3[0], 400, false, false, S.tube4);
    tube(li, [[-total / 2 - 0.3, SIGN_Y + 1.2, fz * 0.6], [total / 2 + 0.3, SIGN_Y + 1.2, fz * 0.6]], 0.06, NEON.lilac, B3[0], 401, false, false, S.tube4);
    // bulb rows along the trims: the lower one with the pillars, the upper one with the arch
    const n = 26;
    for (let i = 0; i < n; i++) {
      const x = -BW / 2 + 0.3 + ((BW - 0.6) * i) / (n - 1);
      bulb([x, SIGN_Y - 1.85, fz * 0.72], 0.17, i % 2 ? NEON.warm : NEON.pink, band(B1, 0.8 + 0.2 * (i / n)));
      bulb([x, SIGN_Y + 1.85, fz * 0.72], 0.17, i % 2 ? NEON.warm : NEON.cyan, band(B3, 0.7 + 0.3 * (i / n)));
    }
  }

  // the holo arch over the sign: a steel arc, a gradient neon tube, bulbs
  const arc: V3[] = Array.from({ length: 25 }, (_, i) => {
    const a = Math.PI * (1 - i / 24);
    return [Math.cos(a) * 7.6, SIGN_Y + 1.8 + Math.sin(a) * 2.2, 0];
  });
  tube(fr, arc, 0.2, STEEL.white, 0, 0, false, false, S.tube8);
  for (let i = 1; i < arc.length - 1; i += 4) bar(fr, STEEL.silver, arc[i], [arc[i][0], SIGN_Y + 1.8, 0], 0.07, S.tube4);
  for (const fz of [1, -1]) {
    const neon = arc.map(([x, y]) => [x, y + 0.26, fz * 0.26] as V3);
    for (let i = 0; i < neon.length - 1; i++) tube(li, [neon[i], neon[i + 1]], 0.11, holo(i / (neon.length - 2)), band(B3, i / (neon.length - 2)), 500 + i);
  }
  for (let i = 1; i < arc.length - 1; i += 2) {
    const [x, y] = arc[i];
    bulb([x, y + 0.5, 0], 0.22, holo(i / arc.length), band(B3, 0.2 + 0.6 * (i / arc.length)));
  }

  const frame = fr.geometry();
  const light = li.geometry();

  // one additive mesh for the glows: the sign's finale glow (front and back, vertices 0-7) and the light pools
  // on the ground in front of and behind the gate (vertices 8-15); their vertex colours set their strength
  const quads = [
    ...[1, -1].map((fz) => new THREE.PlaneGeometry(17, 6.5).rotateY(fz > 0 ? 0 : Math.PI).translate(0, SIGN_Y + 0.4, fz * 0.9)),
    ...[1, -1].map((fz) => new THREE.PlaneGeometry(22, 13).rotateX(-Math.PI / 2).translate(0, 0.2, fz * 5.5)),
  ];
  const fx = mergeGeometries(quads)!;
  for (const q of quads) q.dispose();
  fx.setAttribute("color", new THREE.BufferAttribute(new Float32Array(fx.attributes.position.count * 3), 3));
  return {
    frame,
    light,
    fx,
    dispose() {
      for (const g of [frame, light, fx]) g.dispose();
    },
  };
}

const GLOW = new THREE.Color("#fff27a");
const POOL = new THREE.Color("#ff9ad8");

/** A halo over the arch for phones at night (glow.tsx), in the gate's own metres. */
const GATE_GLOW: GlowSpot[] = [{ p: [0, 9, 0], r: 16, c: "#f2ff0b" }];

export function FunfairGate({ power, night, dusk = false, lite }: ZoneProps) {
  const kit = useMemo(makeWestKit, []);
  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: kit.glow,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [kit],
  );
  useEffect(
    () => () => {
      glowMat.dispose();
      disposeWestKit(kit);
    },
    [kit, glowMat],
  );
  const geo = useMemo(() => buildGate(lite), [lite]);
  useEffect(() => () => geo.dispose(), [geo]);

  const ramp = usePowerRamp(power, 2);
  // the glow and pool strengths last written to the vertex colours
  const shown = useRef([-1, -1]);
  useEffect(() => {
    shown.current = [-1, -1];
  }, [geo]);

  useFrame(({ clock }) => {
    const p = ramp.current;
    const finale = smooth(0.96, 1, p);
    const u = kit.u;
    u.p.value = p;
    u.fade.value = 1 - smooth(0, 0.9, p);
    u.on.value = (night ? 2.7 : 1.35) * (1 + 0.45 * finale);
    u.time.value = clock.elapsedTime;
    u.flick.value = !lite && p !== power ? 1 : 0;
    u.self.value = lite && night ? LITE_SELF_LIT * smooth(0.2, 1, p) : 0;
    const col = geo.fx.attributes.color as THREE.BufferAttribute;
    const g = finale * (night ? 0.75 : 0.26);
    const pl = p * (night ? 0.42 : 0.08) * (0.8 + 0.2 * finale);
    const last = shown.current;
    if (last[0] !== g || last[1] !== pl) {
      last[0] = g;
      last[1] = pl;
      for (let i = 0; i < 16; i++) {
        const [c, k] = i < 8 ? [GLOW, g] : [POOL, pl];
        col.setXYZ(i, c.r * k, c.g * k, c.b * k);
      }
      col.needsUpdate = true;
    }
  });

  return (
    <group position={[GATE_POS[0], 0, GATE_POS[1]]} rotation-y={-Math.PI / 2} scale={UNITS_PER_M}>
      <mesh geometry={geo.frame} material={kit.frame} castShadow receiveShadow />
      <mesh geometry={geo.light} material={kit.light} />
      <mesh geometry={geo.fx} material={glowMat} renderOrder={3} />
      {lite && <LiteGlow spots={GATE_GLOW} power={() => ramp.current} strength={glowStrength(night, dusk)} />}
    </group>
  );
}
