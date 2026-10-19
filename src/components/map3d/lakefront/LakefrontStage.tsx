"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { mat } from "../funfair/central/kit";
import { usePowerRamp } from "../funfair/common";
import { glowStrength, LiteGlow } from "../funfair/glow";
import { UNITS_PER_M } from "../geo";
import { bakeLights, bakeVenue, moatGeometry, shellGeometry, steelGeometry } from "./build";
import { crowdGeometry, crowdMaterial, makeCrowdUniforms } from "./crowd";
import { fxGeometry, GROUP } from "./fx";
import { applyLook, CONCERT, disposeKit, makeKit } from "./kit";
import { GLOW, ORIGIN, POOLS, ROT_Y, WATER_Y } from "./layout";
import { confettiGeometry, confettiMaterial, fireworkGeometry, fireworkMaterial, makeParticleUniforms, SHELL_SLOTS } from "./particles";
import { CONFETTI_LIFE, SHELL_LIFE, showAt } from "./show";

// The LakeFront Café (docs/map3d-lakefront-design.md): the open-air stage under its red ribbed shell, the
// moat, the walkway and the grass amphitheatre, as in Ben's photos. It replaced the old red dome.
//
// Evening (sunset and night): LED ribs, the membrane's wash, uplights, small lights, light pools, and sweeping
// beams in haze (Ben's concert photo); on phones also soft halos.
//
// The concert (`live`; L4 ties it to the funfair's finale): over about 3 s the evening light goes down, a follow
// spot finds the stage, the ribs come on one by one from the front arch back, then a bang (one flash, flames,
// confetti, two fireworks) and the show (show.ts) runs on the wall clock: the shell as an LED screen, the beams
// faster with sky beams, arch beams and lasers, the crowd's lightsticks, the moat's fountains, flame jets, confetti
// at every drop and fireworks over the lake every 2 minutes. Ending it plays the same backwards.
//
// Draw calls: the venue, the steel and the shell's skin (each also in the shadow pass), the moat's water, the small
// lights, the light pools and the effects (one mesh for beams, lasers, flames and fountains); in the concert also
// the crowd, the confetti and the fireworks; lite adds the halos.

const _c = new THREE.Color();
const strongGlow = () => 1;
/** Seconds within the current hour (small enough for the shaders' float precision). */
const wallClock = () => (Date.now() / 1000) % 3600;
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/**
 * Development, for screenshots: ?showt=<seconds> holds the concert at that moment of the show, ?concertp=<0..1>
 * holds the opening at that point (0.84 is the bang).
 */
function held(name: string): number | null {
  if (process.env.NODE_ENV !== "development") return null;
  const q = new URLSearchParams(window.location.search);
  const v = Number(q.get(name));
  return q.has(name) && Number.isFinite(v) ? v : null;
}

/** Point sprites' sizes in metres (bigger on phones, which have no bloom). */
const SIZES = { crowd: [0.55, 1], firework: [1.9, 3], confetti: [0.45, 0.8] } as const;
/** When the concert's ramp (0..1) passes this, the opening's bang goes off and the show starts. */
const BANG = 0.84;

function Pools({ mesh }: { mesh: THREE.InstancedMesh }) {
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      mesh.dispose();
    },
    [mesh],
  );
  return <primitive object={mesh} />;
}

function makePools(material: THREE.Material) {
  const plane = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const m = new THREE.InstancedMesh(plane, material, POOLS.length);
  POOLS.forEach((pl, i) => {
    m.setMatrixAt(i, mat(pl.p[0], pl.p[1], pl.p[2], pl.r[0], 1, pl.r[1]));
    m.setColorAt(i, _c.set(pl.c));
  });
  m.frustumCulled = false;
  m.renderOrder = 2;
  return m;
}

export const LakefrontStage = memo(function LakefrontStage({
  night,
  dusk,
  lite,
  live = false,
}: {
  night: boolean;
  /** The sunset look. */
  dusk: boolean;
  lite: boolean;
  /** The concert is on. */
  live?: boolean;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const frameloop = useThree((s) => s.frameloop);
  const gl = useThree((s) => s.gl);
  const kit = useMemo(() => {
    const k = makeKit();
    const crowd = makeCrowdUniforms();
    const particles = makeParticleUniforms();
    return { ...k, crowd, particles, crowdMat: crowdMaterial(crowd), fireMat: fireworkMaterial(particles), confettiMat: confettiMaterial(particles) };
  }, []);
  useEffect(
    () => () => {
      disposeKit(kit);
      for (const m of [kit.crowdMat, kit.fireMat, kit.confettiMat]) m.dispose();
    },
    [kit],
  );
  const geo = useMemo(
    () => ({
      venue: bakeVenue(lite),
      lights: bakeLights(lite),
      fx: fxGeometry(lite),
      steel: steelGeometry(),
      shell: shellGeometry(),
      moat: moatGeometry(),
      crowd: crowdGeometry(lite),
      fireworks: fireworkGeometry(lite),
      confetti: confettiGeometry(lite),
    }),
    [lite],
  );
  useEffect(
    () => () => {
      for (const g of Object.values(geo)) g.dispose();
    },
    [geo],
  );
  const pools = useMemo(() => makePools(kit.pool), [kit]);
  const fxRef = useRef<THREE.Mesh>(null);
  const crowdRef = useRef<THREE.Points>(null);
  const fireRef = useRef<THREE.Points>(null);
  const confettiRef = useRef<THREE.Points>(null);

  const look = night ? "night" : dusk ? "sunset" : "day";
  // set during render, so the frame this render asks for already shows the new look
  applyLook(kit, look, lite);
  useEffect(() => {
    invalidate();
  }, [look, lite, invalidate]);

  // Everything moves on the wall clock, so every map shows the same moment. Only where the map draws every frame
  // (full screen); a map that draws on demand shows one still moment rather than jumping when the camera moves.
  // Still, too, for anyone who asked the system for reduced motion.
  const still = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const frozen = useRef(wallClock());
  const hold = useMemo(() => ({ t: held("showt"), p: held("concertp") }), []);
  const ramp = usePowerRamp(live ? 1 : 0, 3.2);
  const opening = useRef({ prev: ramp.current, bangAt: -1 });

  useFrame(({ camera, size, viewport }) => {
    const p = hold.p ?? ramp.current;
    const now = wallClock();
    const t = hold.t ?? (frameloop === "always" && !still ? now : frozen.current);
    const show = showAt(t, still);
    const lv = CONCERT[look];
    const u = kit.u;
    const fx = kit.fx;

    // the opening: the evening light goes down, a follow spot, the ribs one by one, then the bang and the show
    const dim = smooth(p / 0.18);
    const spot = smooth((p - 0.12) / 0.18) * (1 - smooth((p - 0.82) / 0.13));
    const liveK = smooth((p - BANG) / (1 - BANG));
    const o = opening.current;
    if (o.prev < BANG && p >= BANG) o.bangAt = now;
    o.prev = p;
    const sinceBang = o.bangAt >= 0 && !still ? now - o.bangAt : -1;
    const bangFlash = sinceBang >= 0 && sinceBang < 0.7 ? Math.exp(-sinceBang * 7) : 0;
    const bangFlame = sinceBang >= 0 && sinceBang < 1 ? smooth(sinceBang / 0.06) * (1 - smooth((sinceBang - 0.55) / 0.4)) : 0;

    u.dim.value = dim;
    u.ribs.value = 7 * smooth((p - 0.32) / 0.48);
    u.live.value = liveK * lv.screen;
    u.colA.value.setRGB(...show.colA, THREE.SRGBColorSpace);
    u.colB.value.setRGB(...show.colB, THREE.SRGBColorSpace);
    u.pulse.value = show.pulse;
    u.beat.value = show.beat;
    u.showT.value = t;
    u.energy.value = show.energy;
    u.flash.value = Math.max(show.flash * liveK, bangFlash) * (look === "day" ? 0.5 : 1);
    u.mix.value.set(...show.mix);

    // the effects: the evening beams and haze give way to the show's
    const g = fx.group.value;
    const ev = kit.evening;
    g[GROUP.beams] = ev.beam * (1 - dim) + lv.beams * liveK;
    g[GROUP.haze] = ev.haze * (1 - dim) + lv.haze * liveK * (0.7 + 0.3 * show.pulse);
    g[GROUP.live] = lv.sky * show.sky * liveK;
    g[GROUP.lasers] = lv.lasers * show.lasers * liveK;
    g[GROUP.flames] = lv.flames * (show.flame > 0 ? liveK : 0) + (bangFlame > 0 ? 1 : 0);
    g[GROUP.jets] = lv.jets * liveK;
    g[GROUP.spot] = lv.spot * spot;
    if (fxRef.current) fxRef.current.visible = g.some((v) => v > 0.002);
    // the beams change clock (and speed) while they are dark in the middle of the opening
    const inShow = p > 0.5;
    fx.sweep.value = inShow ? show.sweep : t;
    fx.amp.value = still ? 0 : inShow ? show.amp : 1;
    fx.pan.value = show.pan * liveK;
    fx.flame.value = Math.max(show.flame, bangFlame);
    fx.jets.value = show.jets;
    fx.recolour.value = liveK;
    fx.pulse.value = show.pulse;
    fx.showT.value = t;
    fx.colA.value.copy(u.colA.value);
    fx.colB.value.copy(u.colB.value);

    // the crowd's lightsticks
    const crowd = kit.crowd;
    crowd.on.value = liveK * lv.crowd;
    crowd.mode.value.set(...show.crowd);
    crowd.colA.value.copy(u.colA.value);
    crowd.colB.value.copy(u.colB.value);
    crowd.showT.value = t;
    crowd.beat.value = show.beat;
    if (crowdRef.current) crowdRef.current.visible = crowd.on.value > 0.01;

    // fireworks (show.ts's schedule, and two for the bang) and confetti (every drop, and the bang)
    const pu = kit.particles;
    const shells = pu.shellT.value;
    for (let i = 0; i < SHELL_SLOTS; i++) {
      const s = i < show.shells.length ? (liveK > 0.5 ? show.shells[i] : -1) : sinceBang - (i - show.shells.length) * 0.7;
      shells[i] = s >= 0 && s < SHELL_LIFE ? s : -1;
    }
    pu.fireOn.value = lv.fireworks;
    if (fireRef.current) fireRef.current.visible = shells.some((s) => s >= 0);
    const fromShow = liveK > 0.5 ? show.confetti : -1;
    const fromBang = sinceBang >= 0 && sinceBang < CONFETTI_LIFE ? sinceBang : -1;
    pu.confettiT.value = fromShow >= 0 && fromBang >= 0 ? Math.min(fromShow, fromBang) : Math.max(fromShow, fromBang);
    pu.confettiOn.value = 1;
    if (confettiRef.current) confettiRef.current.visible = pu.confettiT.value >= 0;

    // point sprites: pixels per world unit at distance 1, in drawing-buffer pixels
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 30;
    const scale = (size.height * viewport.dpr) / (2 * Math.tan((fov * Math.PI) / 360));
    const i = lite ? 1 : 0;
    crowd.scale.value = pu.scale.value = fx.px.value = scale;
    crowd.size.value = SIZES.crowd[i] * UNITS_PER_M;
    pu.fireSize.value = SIZES.firework[i] * UNITS_PER_M;
    pu.confettiSize.value = SIZES.confetti[i] * UNITS_PER_M;

    // the light pools: the evening's, then the show's colours on the beat
    kit.pool.opacity = ev.pool * (1 - dim) + lv.pool * liveK * (0.6 + 0.4 * show.pulse) * (lite ? 1.3 : 1);
    pools.visible = kit.pool.opacity > 0.005;
    if (liveK > 0) {
      POOLS.forEach((pl, k) => pools.setColorAt(k, _c.set(pl.c).lerp(k % 2 ? u.colB.value : u.colA.value, liveK)));
      if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
    }
  });

  // the largest point sprite this device draws
  useEffect(() => {
    const ctx = gl.getContext();
    const range = ctx.getParameter(ctx.ALIASED_POINT_SIZE_RANGE) as Float32Array | null;
    kit.crowd.max.value = kit.particles.max.value = range?.[1] ?? 64;
  }, [gl, kit]);

  return (
    <group position={[ORIGIN[0], 0, ORIGIN[1]]} rotation-y={ROT_Y} scale={UNITS_PER_M}>
      <mesh geometry={geo.venue} material={kit.venue} castShadow receiveShadow />
      <mesh geometry={geo.steel} material={kit.steel} castShadow receiveShadow />
      <mesh geometry={geo.shell} material={kit.shell} castShadow receiveShadow />
      <mesh geometry={geo.lights} material={kit.lights} receiveShadow />
      <mesh geometry={geo.moat} material={kit.water} position-y={WATER_Y} receiveShadow />
      <Pools mesh={pools} />
      <mesh ref={fxRef} geometry={geo.fx} material={kit.fxMat} frustumCulled={false} renderOrder={3} />
      <points ref={crowdRef} geometry={geo.crowd} material={kit.crowdMat} frustumCulled={false} renderOrder={3} />
      <points ref={fireRef} geometry={geo.fireworks} material={kit.fireMat} frustumCulled={false} renderOrder={4} />
      <points ref={confettiRef} geometry={geo.confetti} material={kit.confettiMat} frustumCulled={false} renderOrder={3} />
      {lite && <LiteGlow spots={GLOW} power={strongGlow} strength={glowStrength(night, dusk)} />}
    </group>
  );
});
