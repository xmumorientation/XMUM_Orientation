"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";

import { UNITS_PER_M } from "../geo";
import { smooth } from "./central/kit";
import { usePowerRamp, type ZoneProps } from "./common";
import { buildStatic } from "./east/build";
import { Coaster } from "./east/coaster";
import { disposeEastKit, makeEastKit } from "./east/kit";
import { ORIGIN } from "./east/layout";
import type { Live } from "./east/parts";
import { PowerFx } from "./east/power";
import { PirateShip } from "./east/ship";
import { bulbsMesh } from "./west/kit";

// DRAFT: Vortexa Funfair, East zone "Big Top" (docs/map3d-funfair-design.md),
// in the Retro Carnival style (funfair-lab/styleB.tsx) brightened for day: red
// and cream stripes, gold trim, warm marquee bulbs and Vortexa yellow neon.
// Rides on their dorms' footprints: Canteen D6 the Big Top with its ring road
// and hub, D4 and D5 the VORTEX coaster (station on D4, loop over D5), D2 the
// haunted house, D3 the pirate ship, D1 the arcade and prize stand. The north
// holds the helter-skelter, the food court and the circus wagons; a walk joins
// Central's promenade to the hub, under both legs of the coaster.
//
// Power (the same as West's): off, the tubes are dead light grey glass, the
// bulbs dark, nothing moves, a red standby light pulses on the power box and
// the boards say CLOSED. Powering up (about 2 s) sparks the box, runs the
// current out along the cables, lights the bulbs from the box outwards (the
// Big Top from its door round and up), then starts the coaster's train and
// the pirate ship.
//
// Draw calls: paving, frame (with its shadow), light and bulbs for the static
// part; the train and the ship add two each (and their shadows); the power
// look adds boards, pools, sparks and the standby light. Lite mode keeps the
// same meshes with about half the bulbs, stalls, tables and trees, a coarser
// track, no flicker and no point light.

export function FunfairEast({ power, night, lite }: ZoneProps) {
  const kit = useMemo(makeEastKit, []);
  useEffect(() => () => disposeEastKit(kit), [kit]);
  const built = useMemo(() => buildStatic(lite), [lite]);
  useEffect(() => () => built.dispose(), [built]);
  const bulbs = useMemo(() => bulbsMesh(built.bulbs.list, kit.light), [built, kit]);
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
    // flicker only while the power is changing (full mode)
    u.flick.value = !lite && p > 0 && p < 1 ? 1 : 0;
  });

  return (
    <group position={[ORIGIN[0], 0, ORIGIN[1]]} scale={UNITS_PER_M}>
      <mesh geometry={built.paving} material={kit.paving} receiveShadow />
      <mesh geometry={built.frame} material={kit.frame} castShadow receiveShadow />
      <mesh geometry={built.light} material={kit.light} />
      <primitive object={bulbs} />
      <Coaster kit={kit} live={live} lite={lite} />
      <PirateShip kit={kit} live={live} lite={lite} />
      <PowerFx kit={kit} live={live} night={night} lite={lite} boards={built.boards} pools={built.pools} />
    </group>
  );
}
