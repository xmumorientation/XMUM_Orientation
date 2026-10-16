"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";

import { UNITS_PER_M } from "../geo";
import { smooth } from "./central/kit";
import { LITE_LIGHT_SCALE, LITE_PAVING_LIT, LITE_SELF_LIT, usePowerRamp, type ZoneProps } from "./common";
import { LiteGlow, type GlowSpot } from "./glow";
import { buildStatic } from "./west/build";
import { Carousel } from "./west/carousel";
import { Ducks } from "./west/ducks";
import { bulbsMesh, disposeWestKit, makeWestKit } from "./west/kit";
import { Lighthouse } from "./west/lagoon";
import { BOOTHS, CAROUSEL, DOME, FOOD, ISLAND, ORIGIN, SPIDERS, WHEEL } from "./west/layout";
import type { Live } from "./west/parts";
import { PowerFx } from "./west/power";
import { Spiders } from "./west/spider";
import { VortexaEye } from "./west/wheel";

// DRAFT: Vortexa Funfair, West zone "Neon Pier" (docs/map3d-funfair-design.md),
// in the Neon Cyber style (style A bench, in git history at 4eee382) brightened for day: silver-
// white steel with Vortexa neon. Rides on their dorms' footprints: LY3 the
// Vortexa Eye (Ferris wheel) with food stalls, LY1 the carousel, LY2 the game
// booths with the duck shoot, LY6 and LY7 the spider rides. The north half
// holds the pier: neon arches, a lagoon with duck boats and a lighthouse, the
// palm grove with the neon dome, and the food court.
//
// Power: off, the tubes are dead light grey glass, the bulbs dark, nothing
// moves, a red standby light pulses on the power box and the boards say
// CLOSED. Powering up (about 2 s) sparks the box, runs the current out along
// the cables, lights the bulbs from the box outwards (the Eye opens from its
// hub to its rim), then starts the rides.
//
// Draw calls: paving, water, frame (with its shadow), lights and bulbs for
// the static part; each ride adds two to six; lite mode keeps the same meshes
// with about half the bulbs, stalls, tables and trees, no flicker and no
// point light.

/** Halos for phones at night (glow.tsx): the Vortexa Eye's hub, each ride, the lighthouse, the dome, the food court. */
const GLOW: GlowSpot[] = [
  { p: [WHEEL[0], 24.6, WHEEL[1]], r: 30, c: "#ff3fbf" },
  { p: [CAROUSEL[0], 6, CAROUSEL[1]], r: 18, c: "#e0b4fc" },
  ...SPIDERS.map((s): GlowSpot => ({ p: [s[0], 6, s[1]], r: 18, c: "#0dfcfd" })),
  { p: [BOOTHS[0], 4, BOOTHS[1]], r: 20, c: "#f2ff0b" },
  { p: [ISLAND.x, 16, ISLAND.z], r: 14, c: "#9ff6ff" },
  { p: [DOME[0], 8, DOME[1]], r: 16, c: "#e0b4fc" },
  { p: [(FOOD.x[0] + FOOD.x[1]) / 2, 4, (FOOD.z[0] + FOOD.z[1]) / 2], r: 18, c: "#fc9e3d" },
];

export function FunfairWest({ power, night, lite }: ZoneProps) {
  const kit = useMemo(makeWestKit, []);
  useEffect(() => () => disposeWestKit(kit), [kit]);
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
      <mesh geometry={built.water} material={kit.water} receiveShadow />
      <mesh geometry={built.frame} material={kit.frame} castShadow receiveShadow />
      <mesh geometry={built.light} material={kit.light} />
      <primitive object={bulbs} />
      <VortexaEye kit={kit} live={live} lite={lite} />
      <Carousel kit={kit} live={live} lite={lite} />
      <Spiders kit={kit} live={live} />
      <Ducks kit={kit} live={live} lite={lite} />
      <Lighthouse kit={kit} live={live} night={night} />
      <PowerFx kit={kit} live={live} night={night} lite={lite} boards={built.boards} pools={built.pools} />
      {lite && <LiteGlow spots={GLOW} power={() => live.current.p} night={night} />}
    </group>
  );
}
