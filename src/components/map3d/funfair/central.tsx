"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";

import { UNITS_PER_M } from "../geo";
import { buildStatic } from "./central/build";
import { BumperCars } from "./central/bumper";
import { DropRing } from "./central/drop";
import { disposeKit, makeKit, smooth } from "./central/kit";
import { BUMPER, CROSSING, DROP, FOUNTAIN, ORIGIN, STAGE, SWINGS, TEACUPS } from "./central/layout";
import type { Live } from "./central/parts";
import { PowerFx } from "./central/power";
import { SwingTop } from "./central/swings";
import { Teacups } from "./central/teacups";
import { LITE_LIGHT_SCALE, LITE_PAVING_LIT, LITE_SELF_LIT, usePowerRamp, type ZoneProps } from "./common";
import { DUSK_SHARE, glowStrength, LiteGlow, type GlowSpot } from "./glow";

// DRAFT: Vortexa Funfair, Central zone "Starlight Midway" (docs/map3d-funfair-design.md),
// in the toy low-poly style (style C bench, in git history at 4eee382). Rides on their dorms'
// footprints: LY9 drop tower, LY8 swing ride, LY4 teacups, LY5 bumper cars.
//
// Power: off, the paint is grey and the bulbs and neon are dead, a red
// standby light pulses on the power box and the boards say CLOSED. Powering
// up (about 2 s) sparks the box, runs the current out along the cables, lights
// the bulbs from the box outwards, then starts the rides.
//
// Draw calls: ground, paint, neon and bulbs are one mesh each; each ride adds
// one to three; lite mode keeps the same meshes with fewer bulbs, stalls,
// trees and cars, no flicker and no point light.

/** Halos for phones at night (glow.tsx): the drop tower's top, the Starlight star, and each ride. */
const GLOW: GlowSpot[] = [
  { p: [DROP[0], 40, DROP[1]], r: 20, c: "#5ff6ff" },
  { p: [CROSSING[0], 15, CROSSING[1]], r: 16, c: "#7ff6ff" },
  { p: [TEACUPS[0], 6, TEACUPS[1]], r: 24, c: "#c9a2f2" },
  { p: [SWINGS[0], 12, SWINGS[1]], r: 22, c: "#ff4fbf" },
  { p: [BUMPER[0], 6, BUMPER[1]], r: 20, c: "#f2ff0b" },
  { p: [FOUNTAIN[0], 4, FOUNTAIN[1]], r: 12, c: "#9fe9ff" },
  { p: [STAGE[0], 6, STAGE[1]], r: 14, c: "#fc9e3d" },
];

export function FunfairCentral({ power, night, dusk = false, lite }: ZoneProps) {
  const kit = useMemo(makeKit, []);
  useEffect(() => () => disposeKit(kit), [kit]);
  const built = useMemo(() => buildStatic(lite), [lite]);
  useEffect(() => () => built.dispose(), [built]);
  const bulbs = useMemo(() => built.bulbs.mesh(kit.bulb, lite ? LITE_LIGHT_SCALE : 1), [built, kit, lite]);
  useEffect(
    () => () => {
      bulbs.geometry.dispose();
      bulbs.dispose();
    },
    [bulbs],
  );

  const ramp = usePowerRamp(power, 2);
  const live = useRef<Live>({ p: ramp.current, run: smooth(0.55, 1, ramp.current), dt: 0, time: 0 });

  useFrame(({ clock }, dt) => {
    const p = ramp.current;
    const L = live.current;
    L.p = p;
    L.dt = Math.min(dt, 0.1);
    L.time = clock.elapsedTime;
    // the rides start once most lights are on
    L.run = smooth(0.55, 1, p);
    const u = kit.u;
    u.p.value = p;
    u.fade.value = 1 - smooth(0.12, 0.8, p);
    u.on.value = night ? 2.7 : 1.35;
    u.time.value = clock.elapsedTime;
    u.flick.value = lite ? 0 : 1;
    // phones at night: no point light or bloom there, so the powered rides and walks glow a little by themselves
    const self = lite && night ? smooth(0.4, 1, p) : 0;
    u.self.value = LITE_SELF_LIT * self;
    kit.paving.emissiveIntensity = LITE_PAVING_LIT * self;
    kit.pool.opacity = p * (night ? (lite ? 0.85 : 0.5) : lite && dusk ? 0.1 + 0.75 * DUSK_SHARE : 0.1);
  });

  return (
    <group position={[ORIGIN[0], 0, ORIGIN[1]]} scale={UNITS_PER_M}>
      <mesh geometry={built.paving} material={kit.paving} receiveShadow />
      <mesh geometry={built.paint} material={kit.paint} castShadow receiveShadow />
      <mesh geometry={built.neon} material={kit.neon} />
      <primitive object={bulbs} />
      <DropRing kit={kit} live={live} lite={lite} />
      <SwingTop kit={kit} live={live} lite={lite} />
      <Teacups kit={kit} live={live} lite={lite} />
      <BumperCars kit={kit} live={live} lite={lite} />
      <PowerFx kit={kit} live={live} night={night} lite={lite} boards={built.boards} pools={built.pools} />
      {lite && <LiteGlow spots={GLOW} power={() => live.current.p} strength={glowStrength(night, dusk)} />}
    </group>
  );
}
