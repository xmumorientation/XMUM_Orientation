"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo } from "react";
import * as THREE from "three";

import { mat } from "../funfair/central/kit";
import { glowStrength, LiteGlow } from "../funfair/glow";
import { UNITS_PER_M } from "../geo";
import { beamGeometry } from "./beams";
import { bakeLights, bakeVenue, moatGeometry, shellGeometry, steelGeometry } from "./build";
import { applyLook, disposeKit, makeKit } from "./kit";
import { GLOW, ORIGIN, POOLS, ROT_Y, WATER_Y } from "./layout";

// DRAFT: the LakeFront Café (docs/map3d-lakefront-design.md): the open-air stage under its red ribbed shell, the
// moat, the walkway and the grass amphitheatre, as in Ben's photos. Replaces the old red dome (buildings.tsx Dome).
//
// Standby lighting (sunset and night, no concert): the ribs' LED lines, the membrane's wash, uplights on the shell,
// small lights, light pools, and a fan of beams in haze (Ben's concert photo); on phones also soft halos. Static,
// set when the look changes.
//
// Draw calls: the venue, the steel and the shell's skin (each also in the shadow pass), the moat's water, the
// small lights, the light pools and the beams; lite adds the halos.

const _c = new THREE.Color();
const strongGlow = () => 1;
/** Seconds within the current hour (small enough for the shader's float precision). */
const wallClock = () => (Date.now() / 1000) % 3600;

function Pools({ material }: { material: THREE.Material }) {
  const mesh = useMemo(() => {
    const plane = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const m = new THREE.InstancedMesh(plane, material, POOLS.length);
    POOLS.forEach((pl, i) => {
      m.setMatrixAt(i, mat(pl.p[0], pl.p[1], pl.p[2], pl.r[0], 1, pl.r[1]));
      m.setColorAt(i, _c.set(pl.c));
    });
    m.frustumCulled = false;
    m.renderOrder = 2;
    return m;
  }, [material]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      mesh.dispose();
    },
    [mesh],
  );
  return <primitive object={mesh} visible={(material as THREE.MeshBasicMaterial).opacity > 0} />;
}

export const LakefrontStage = memo(function LakefrontStage({
  night,
  dusk,
  lite,
}: {
  night: boolean;
  /** The sunset look. */
  dusk: boolean;
  lite: boolean;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const kit = useMemo(makeKit, []);
  useEffect(() => () => disposeKit(kit), [kit]);
  const geo = useMemo(
    () => ({
      venue: bakeVenue(lite),
      lights: bakeLights(lite),
      beams: beamGeometry(lite),
      steel: steelGeometry(),
      shell: shellGeometry(),
      moat: moatGeometry(),
    }),
    [lite],
  );
  useEffect(
    () => () => {
      for (const g of Object.values(geo)) g.dispose();
    },
    [geo],
  );
  const look = night ? "night" : dusk ? "sunset" : "day";
  // set during render, so the frame this render asks for already shows the new look
  applyLook(kit, look, lite);
  useEffect(() => {
    invalidate();
  }, [look, lite, invalidate]);

  // The beams sweep on the wall clock, so every map shows the same move. Only where the map draws every frame
  // (full screen): a map that draws on demand keeps them still rather than jumping when the camera moves. Still,
  // too, for anyone who asked the system for reduced motion.
  const frameloop = useThree((s) => s.frameloop);
  const still = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  if (kit.u.time.value === 0) kit.u.time.value = wallClock();
  useFrame(() => {
    if (frameloop === "always" && !still && kit.u.beam.value > 0) kit.u.time.value = wallClock();
  });

  return (
    <group position={[ORIGIN[0], 0, ORIGIN[1]]} rotation-y={ROT_Y} scale={UNITS_PER_M}>
      <mesh geometry={geo.venue} material={kit.venue} castShadow receiveShadow />
      <mesh geometry={geo.steel} material={kit.steel} castShadow receiveShadow />
      <mesh geometry={geo.shell} material={kit.shell} castShadow receiveShadow />
      <mesh geometry={geo.lights} material={kit.lights} receiveShadow />
      <mesh geometry={geo.moat} material={kit.water} position-y={WATER_Y} receiveShadow />
      <Pools material={kit.pool} />
      <mesh geometry={geo.beams} material={kit.beams} frustumCulled={false} renderOrder={3} visible={kit.u.beam.value > 0} />
      {lite && <LiteGlow spots={GLOW} power={strongGlow} strength={glowStrength(night, dusk)} />}
    </group>
  );
});
