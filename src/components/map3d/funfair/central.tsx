"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";

import { UNITS_PER_M } from "../geo";
import { buildStatic } from "./central/build";
import { BumperCars } from "./central/bumper";
import { DropRing } from "./central/drop";
import { disposeKit, makeKit, smooth } from "./central/kit";
import { ORIGIN } from "./central/layout";
import type { Live } from "./central/parts";
import { PowerFx } from "./central/power";
import { SwingTop } from "./central/swings";
import { Teacups } from "./central/teacups";
import { usePowerRamp, type ZoneProps } from "./common";

// DRAFT: Vortexa Funfair, Central zone "Starlight Midway" (docs/map3d-funfair-design.md),
// in the toy low-poly style (funfair-lab/styleC.tsx). Rides on their dorms'
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

export function FunfairCentral({ power, night, lite }: ZoneProps) {
  const kit = useMemo(makeKit, []);
  useEffect(() => () => disposeKit(kit), [kit]);
  const built = useMemo(() => buildStatic(lite), [lite]);
  useEffect(() => () => built.dispose(), [built]);
  const bulbs = useMemo(() => built.bulbs.mesh(kit.bulb), [built, kit]);
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
    kit.pool.opacity = p * (night ? 0.5 : 0.1);
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
    </group>
  );
}
