"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";

import { UNITS_PER_M } from "../geo";
import { smooth } from "./central/kit";
import { LITE_LIGHT_SCALE, LITE_PAVING_LIT, LITE_SELF_LIT, usePowerRamp, type ZoneProps } from "./common";
import { glowStrength, LiteGlow, type GlowSpot } from "./glow";
import { buildStatic } from "./east/build";
import { Coaster } from "./east/coaster";
import { disposeEastKit, makeEastKit } from "./east/kit";
import { ARCADE, BANDSTAND, BIGTOP, CIRCUS, DINER, FOOD, HAUNTED, HS, LOOP_C, ORIGIN, SHIP, SQUARE, STATION } from "./east/layout";
import type { Live } from "./east/parts";
import { PowerFx } from "./east/power";
import { PirateShip } from "./east/ship";
import { bulbsMesh } from "./west/kit";

// DRAFT: Vortexa Funfair, East zone "Big Top" (docs/map3d-funfair-design.md),
// in the Retro Carnival style (style B bench, in git history at 4eee382) brightened for day: red
// and cream stripes, gold trim, warm marquee bulbs and Vortexa yellow neon.
// Rides on their dorms' real middles: Canteen D6 the Big Top with its ring road
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

/** The coaster's loop stands over D5's middle (coaster.tsx). */
const LOOP = LOOP_C;

/** Halos for phones at night (glow.tsx): the Big Top, the coaster's loop and station, each ride, the food court. */
const GLOW: GlowSpot[] = [
  { p: [BIGTOP[0], 14, BIGTOP[1]], r: 34, c: "#ffd23f" },
  { p: [LOOP[0], 11, LOOP[1]], r: 20, c: "#f2ff0b" },
  { p: [STATION.x, 6, (STATION.z[0] + STATION.z[1]) / 2], r: 16, c: "#ff5a5a" },
  { p: [SHIP[0], 10, SHIP[1]], r: 16, c: "#fc9e3d" },
  { p: [HAUNTED[0], 8, HAUNTED[1]], r: 14, c: "#9dff7a" },
  { p: [ARCADE[0], 5, ARCADE[1]], r: 16, c: "#fe06ab" },
  { p: [HS[0], 10, HS[1]], r: 12, c: "#e0b4fc" },
  { p: [(FOOD.x[0] + FOOD.x[1]) / 2, 4, (FOOD.z[0] + FOOD.z[1]) / 2], r: 18, c: "#fc9e3d" },
  { p: [SQUARE[0], 6, SQUARE[1]], r: 18, c: "#ffd23f" },
  { p: [DINER.x - 4, 5, DINER.z], r: 14, c: "#fe06ab" },
  { p: [BANDSTAND[0], 5, BANDSTAND[1]], r: 11, c: "#ffc978" },
  { p: [CIRCUS[0], 6, CIRCUS[1]], r: 15, c: "#fc9e3d" },
];

export function FunfairEast({ power, night, dusk = false, lite }: ZoneProps) {
  const kit = useMemo(makeEastKit, []);
  useEffect(() => () => disposeEastKit(kit), [kit]);
  const built = useMemo(() => buildStatic(lite), [lite]);
  useEffect(() => () => built.dispose(), [built]);
  const bulbs = useMemo(() => bulbsMesh(built.bulbs.list, kit.light, lite ? LITE_LIGHT_SCALE : 1), [built, kit, lite]);
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
    // phones at night: no point light or bloom there, so the powered rides and walks glow a little by themselves
    const self = lite && night ? smooth(0.4, 1, p) : 0;
    u.self.value = LITE_SELF_LIT * self;
    kit.paving.emissiveIntensity = LITE_PAVING_LIT * self;
  });

  return (
    <group position={[ORIGIN[0], 0, ORIGIN[1]]} scale={UNITS_PER_M}>
      <mesh geometry={built.paving} material={kit.paving} receiveShadow />
      <mesh geometry={built.frame} material={kit.frame} castShadow receiveShadow />
      <mesh geometry={built.light} material={kit.light} />
      <primitive object={bulbs} />
      <Coaster kit={kit} live={live} lite={lite} />
      <PirateShip kit={kit} live={live} lite={lite} />
      <PowerFx kit={kit} live={live} night={night} dusk={dusk} lite={lite} boards={built.boards} pools={built.pools} />
      {lite && <LiteGlow spots={GLOW} power={() => live.current.p} strength={glowStrength(night, dusk)} />}
    </group>
  );
}
