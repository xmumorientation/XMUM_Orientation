"use client";

import { memo, useEffect, useMemo } from "react";

import { UNITS_PER_M } from "../geo";
import { bakeVenue, moatGeometry, shellGeometry, steelGeometry } from "./build";
import { disposeKit, makeKit } from "./kit";
import { ORIGIN, ROT_Y, WATER_Y } from "./layout";

// DRAFT: the LakeFront Café (docs/map3d-lakefront-design.md): the open-air stage under its red ribbed shell, the
// moat, the walkway and the grass amphitheatre, as in Ben's photos. Replaces the old red dome (buildings.tsx Dome).
//
// Draw calls: the venue, the steel, the shell's skin (each also in the shadow pass) and the moat's water.

export const LakefrontStage = memo(function LakefrontStage({ lite }: { lite: boolean }) {
  const kit = useMemo(makeKit, []);
  useEffect(() => () => disposeKit(kit), [kit]);
  const geo = useMemo(
    () => ({ venue: bakeVenue(lite), steel: steelGeometry(), shell: shellGeometry(), moat: moatGeometry() }),
    [lite],
  );
  useEffect(
    () => () => {
      for (const g of Object.values(geo)) g.dispose();
    },
    [geo],
  );

  return (
    <group position={[ORIGIN[0], 0, ORIGIN[1]]} rotation-y={ROT_Y} scale={UNITS_PER_M}>
      <mesh geometry={geo.venue} material={kit.venue} castShadow receiveShadow />
      <mesh geometry={geo.steel} material={kit.steel} castShadow receiveShadow />
      <mesh geometry={geo.shell} material={kit.shell} castShadow receiveShadow />
      <mesh geometry={geo.moat} material={kit.water} position-y={WATER_Y} receiveShadow />
    </group>
  );
});
