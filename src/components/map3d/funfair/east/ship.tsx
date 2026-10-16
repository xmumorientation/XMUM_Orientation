"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import type * as THREE from "three";

import { Bake, G, TAU, mat, type V3 } from "../central/kit";
import { S, bar, tube } from "../west/kit";
import { PLAZA_Y } from "./ground";
import { NEON, PAINT, bulbC, type EastKit } from "./kit";
import { SHIP, SHIP_R, SHIP_RY } from "./layout";
import { beads, commit, disposeAll, fenceRing, neonText, newLocal, placeM, tAt, type Live, type Parts } from "./parts";

// DRAFT: D3, the pirate ship (swinging boat). Two cream A-frames with yellow
// neon and bulbs up their legs hold the axle and the PIRATE sign; the boat, red
// below and cream above with a gold rail, bulbs along both rails and black
// flags at bow and stern, hangs on four gold arms and swings once the zone is on.
// The ride's frame: local x is the swing's direction, z the axle.

const PIVOT_Y = 15.5;
const ARM = 9.8;
const HL = 9;
const HW = 2.1;
const FRAME_Z = HW + 1.7;

export function bakeShip(p: Parts) {
  const l = newLocal(p.lite);
  const fr = l.frame;
  const t = tAt(SHIP[0], SHIP[1]);
  const top = PIVOT_Y;
  for (const sz of [-1, 1]) {
    const zf = sz * FRAME_Z;
    const apex: V3 = [0, top, zf];
    for (const sx of [-1, 1]) {
      const foot: V3 = [sx * 8, 0, zf + sz * 2.2];
      bar(fr, PAINT.cream, foot, apex, 0.32, S.tube8);
      fr.cyl(PAINT.red, [foot[0], 0.3, foot[2]], 0.65, 0.6, G.cyl8);
      // neon and bulbs up the leg's outer side
      const o: V3 = [sx * 0.42, 0, sz * 0.2];
      const a: V3 = [foot[0] + o[0], 1.2, foot[2] + o[2]];
      const b: V3 = [apex[0] + o[0] * 0.3, top - 0.8, apex[2] + o[2]];
      tube(l.light, [a, b], 0.07, NEON.yellow, t + 0.02, 40 + (sx + 1) * 2 + (sz + 1), false, false, S.tube4);
      beads(l.bulbs, [[a[0] + sx * 0.12, a[1] + 0.4, a[2]], [b[0] + sx * 0.12, b[1] - 0.4, b[2]]], p.lite ? 1.8 : 1.1, 0.15, (f) => t + 0.03 + 0.08 * f);
    }
    bar(fr, PAINT.red, [-5, 5.2, zf + sz * 1.45], [5, 5.2, zf + sz * 1.45], 0.18, S.tube6);
    fr.add(S.cyl20, mat(0, top, zf + sz * 0.45, 1.0, 0.5, 1.0, 0, Math.PI / 2), PAINT.gold);
  }
  bar(fr, PAINT.gold, [0, top, -FRAME_Z - 0.5], [0, top, FRAME_Z + 0.5], 0.36, S.tube8);
  // the PIRATE sign over the axle, facing +z (the default view)
  const sy = top + 2.4;
  for (const x of [-3.2, 3.2]) bar(fr, PAINT.gold, [x, top, FRAME_Z + 0.35], [x, sy, FRAME_Z + 0.35], 0.1, S.tube4);
  fr.box(PAINT.red, [0, sy, FRAME_Z + 0.35], [8.8, 2.0, 0.3]);
  fr.box(PAINT.gold, [0, sy - 1.08, FRAME_Z + 0.35], [9.0, 0.18, 0.4]);
  fr.box(PAINT.gold, [0, sy + 1.08, FRAME_Z + 0.35], [9.0, 0.18, 0.4]);
  neonText(l.light, "PIRATE", 1.25, sy - 0.62, FRAME_Z + 0.55, 0.08, NEON.yellow, t + 0.04, 800);
  beads(l.bulbs, [[-4.3, sy + 1.3, FRAME_Z + 0.4], [4.3, sy + 1.3, FRAME_Z + 0.4]], 0.55, 0.13, t + 0.05);
  // the operator's booth by the gate
  fr.box(PAINT.teal, [-3, 1.3, 9.6], [2.2, 2.6, 2.0]);
  fr.box(PAINT.red, [-3, 2.75, 9.6], [2.6, 0.3, 2.4]);
  commit(p, l, placeM(SHIP[0], SHIP[1], SHIP_RY, PLAZA_Y));

  // the fence round the plaza, open towards the lane from the ring road (east)
  fenceRing(p, SHIP[0], SHIP[1], SHIP_R - 1.2, PLAZA_Y, [Math.atan2(5, 34)], NEON.yellow, t + 0.01);
  p.boards.push({ x: SHIP[0] + SHIP_R - 3.5, z: SHIP[1] - 4, ry: 0 });
  p.pools.push({ x: SHIP[0], z: SHIP[1], r: SHIP_R + 3, c: NEON.yellow });
}

/** The boat, in the pivot's frame (it hangs below it, swinging about z). */
function boatGeometry(lite: boolean, t: number) {
  const fr = new Bake();
  const li = new Bake();
  const D = -ARM;
  const gun = (x: number) => D + 1.2 + 2.4 * (x / HL) ** 4;
  const keel = (x: number) => D - 1.1 + 1.0 * (x / HL) ** 2;
  const wid = (x: number) => HW * Math.sqrt(Math.max(0.05, 1 - (x / (HL + 0.5)) ** 2));
  const band = (x: number) => keel(x) + (gun(x) - keel(x)) * 0.55;
  const N = 12;
  for (let i = 0; i < N; i++) {
    const a = -HL + (2 * HL * i) / N;
    const b = a + (2 * HL) / N;
    for (const sz of [-1, 1]) {
      fr.quad(PAINT.red, [a, keel(a), sz * wid(a) * 0.55], [b, keel(b), sz * wid(b) * 0.55], [b, band(b), sz * wid(b)], [a, band(a), sz * wid(a)], true);
      fr.quad(PAINT.cream, [a, band(a), sz * wid(a)], [b, band(b), sz * wid(b)], [b, gun(b), sz * wid(b)], [a, gun(a), sz * wid(a)], true);
      bar(fr, PAINT.gold, [a, gun(a) + 0.05, sz * wid(a)], [b, gun(b) + 0.05, sz * wid(b)], 0.1, S.tube4);
      bar(fr, PAINT.gold, [a, band(a), sz * wid(a) * 1.01], [b, band(b), sz * wid(b) * 1.01], 0.06, S.tube4);
    }
    fr.quad(PAINT.redDeep, [a, keel(a), -wid(a) * 0.55], [b, keel(b), -wid(b) * 0.55], [b, keel(b), wid(b) * 0.55], [a, keel(a), wid(a) * 0.55], true);
    fr.quad(PAINT.wood, [a, D + 0.25, -wid(a) * 0.95], [b, D + 0.25, -wid(b) * 0.95], [b, D + 0.25, wid(b) * 0.95], [a, D + 0.25, wid(a) * 0.95], true);
  }
  for (const e of [-HL, HL]) {
    const w = wid(e);
    fr.quad(PAINT.red, [e, gun(e), -w], [e, gun(e), w], [e, keel(e), w * 0.55], [e, keel(e), -w * 0.55], true);
    // a mast with a black flag at each end
    const mx = e * 0.93;
    bar(fr, PAINT.woodDark, [mx, gun(mx) - 0.4, 0], [mx, gun(mx) + 3.2, 0], 0.09, S.tube4);
    fr.tri(PAINT.black, [mx, gun(mx) + 3.2, 0], [mx, gun(mx) + 2.0, 0], [mx - Math.sign(e) * 2.0, gun(mx) + 2.6, 0], true);
    fr.ball(PAINT.white, [mx - Math.sign(e) * 0.8, gun(mx) + 2.6, 0.02], 0.22);
  }
  // benches across the boat
  for (let i = 0; i < 6; i++) {
    const x = -6.25 + i * 2.5;
    fr.box(PAINT.navy, [x, D + 0.7, 0], [0.5, 0.9, wid(x) * 1.8]);
  }
  // the arms: two gold V's from the axle to the rails, and the hub
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const foot: V3 = [sx * 3.4, gun(3.4) + 0.1, sz * wid(3.4)];
      bar(fr, PAINT.gold, [0, 0, sz * (HW + 0.9)], foot, 0.17, S.tube6);
      tube(li, [[0, -0.7, sz * (HW + 1.1)], [foot[0] * 0.92, foot[1] + 0.6, sz * (wid(3.4) + 0.25)]], 0.07, NEON.yellow, t, 60 + sx + sz * 3, false, false, S.tube4);
    }
  }
  fr.add(S.cyl12, mat(0, 0, 0, 0.6, 2 * (HW + 1.2), 0.6, 0, Math.PI / 2), PAINT.gold);
  // bulbs along both rails
  const step = lite ? 1.6 : 0.9;
  let k = 0;
  for (const sz of [-1, 1]) {
    for (let x = -HL + 0.4; x <= HL - 0.4; x += step) li.add(S.bulb, mat(x, gun(x) + 0.28, sz * wid(x), 0.16), bulbC(k), t + 0.02, k++);
  }
  return { frame: fr.geometry(), light: li.geometry() };
}

export function PirateShip({ kit, live, lite }: { kit: EastKit; live: RefObject<Live>; lite: boolean }) {
  const swing = useRef<THREE.Group>(null);
  const st = useRef({ ph: 0, amp: 0 });
  const geo = useMemo(() => boatGeometry(lite, tAt(SHIP[0], SHIP[1]) + 0.05), [lite]);
  useEffect(() => () => disposeAll([geo.frame, geo.light]), [geo]);

  useFrame(() => {
    const L = live.current;
    if (!L || !swing.current) return;
    const k = st.current;
    // the swing builds up (and dies down) over a few strokes
    k.amp += (0.85 * L.run - k.amp) * Math.min(1, L.dt * 0.4);
    if (k.amp < 1e-4 && L.run === 0) return;
    k.ph += L.dt * (TAU / 6.5);
    swing.current.rotation.z = k.amp * Math.sin(k.ph);
  });

  return (
    <group position={[SHIP[0], PLAZA_Y + PIVOT_Y, SHIP[1]]} rotation-y={SHIP_RY}>
      <group ref={swing}>
        <mesh geometry={geo.frame} material={kit.frame} castShadow receiveShadow />
        <mesh geometry={geo.light} material={kit.light} />
      </group>
    </group>
  );
}
