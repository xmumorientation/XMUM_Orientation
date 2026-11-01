"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { makeGlow } from "../textures";
import { BALL_R } from "./ball";
import { courtFrame, TENNIS_COURTS } from "./court";
import { aimShadows, makePlayer, playerMaterial, playerShadowMaterial, posePlayer } from "./player";
import { rallyAt } from "./rally";
import { CourtSurface } from "./surface";

// DRAFT: /map3d?tennis=demo (docs/ROADMAP.md, item 9, batch T1a): a looping rally on each of the three tennis
// courts, two players in sample group colours, on crisp courts (surface.tsx), seen through the broadcast view's
// lens (court.ts courtView). No game yet. The players are far too small for the shadow map, so each casts its own
// flattened shadow (player.ts playerShadowMaterial), and the ball has a soft round one (it shows how high it is).

/** Sample shirts, two per court (Admin's group colours in the real game). */
const DEMO_SHIRTS: [string, string][] = [
  ["#008cff", "#fe06ab"],
  ["#f2ff0b", "#0dfcfd"],
  ["#fc9e3d", "#e0b4fc"],
];

/** The ball's shadow lies just over the court (metres in the court frame; about 0.02 world units). */
const SHADOW_Y = 0.15;

/**
 * One court's looping rally. Also a busy court's from afar (TennisLive.tsx, T3a), which keeps the map drawing only
 * while `animate()` says its court is seen.
 */
export function RallyCourt({ index, shirts, material, shadow, shadowTex, at, animate }: {
  index: number;
  shirts: [string, string];
  material: THREE.Material;
  /** The players' shadows (playerShadowMaterial), and the ball's (a soft dot). */
  shadow: THREE.Material;
  shadowTex: THREE.Texture;
  at: number | null;
  animate?: () => boolean;
}) {
  const frame = courtFrame(TENNIS_COURTS[index]);
  const players = useMemo(() => shirts.map((s) => makePlayer(s, material, shadow)), [shirts, material, shadow]);
  useEffect(() => () => players.forEach((p) => p.dispose()), [players]);
  const ball = useRef<THREE.Mesh>(null);
  const ballShadow = useRef<THREE.Mesh>(null);
  // each court plays its own rally, out of step with the others
  const seed = 17 + index * 101;
  const offset = index * 0.83;

  useFrame(({ clock, invalidate, scene }) => {
    const f = rallyAt((at ?? clock.elapsedTime) + offset, seed);
    f.players.forEach((p, i) => {
      const { rig } = players[i];
      rig.root.position.set(p.x, 0, p.z);
      rig.root.rotation.y = p.yaw;
      posePlayer(rig, p.pose);
    });
    aimShadows(shadow, scene);
    const [bx, by, bz] = f.ball;
    ball.current?.position.set(bx, by, bz);
    const s = ballShadow.current;
    if (s) {
      s.position.set(bx, SHADOW_Y, bz);
      s.scale.setScalar(Math.max(0.5, 1 - by / 8));
    }
    // the map draws on demand on phones: keep asking while the rally plays (a held moment needs no more frames)
    if (at === null && (animate?.() ?? true)) invalidate();
  });

  return (
    <group position={frame.position} rotation-y={frame.rotY} scale={frame.scale}>
      {players.map((p, i) => (
        <primitive key={i} object={p.rig.root} />
      ))}
      <mesh ref={ball}>
        <sphereGeometry args={[BALL_R, 10, 8]} />
        <meshStandardMaterial color="#d8f03c" emissive="#d8f03c" emissiveIntensity={0.4} roughness={0.6} />
      </mesh>
      <mesh ref={ballShadow} rotation-x={-Math.PI / 2} renderOrder={2}>
        <planeGeometry args={[0.45, 0.45]} />
        <meshBasicMaterial map={shadowTex} color="#000" transparent opacity={0.45} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Puts the broadcast view's lens on the map's camera while mounted (the map's own is 30°). */
function useLens(fov: number) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const was = camera.fov;
    camera.fov = fov;
    camera.updateProjectionMatrix();
    invalidate();
    return () => {
      camera.fov = was;
      camera.updateProjectionMatrix();
    };
  }, [camera, fov, invalidate]);
}

/** `fov`: the lens courtView() chose with the start view. `at`: hold the rally at this many seconds in (screenshots). */
export function TennisDemo({ fov, at = null }: { fov: number; at?: number | null }) {
  useLens(fov);
  const material = useMemo(playerMaterial, []);
  const shadow = useMemo(playerShadowMaterial, []);
  const shadowTex = useMemo(makeGlow, []);
  useEffect(
    () => () => {
      material.dispose();
      shadow.dispose();
      shadowTex.dispose();
    },
    [material, shadow, shadowTex],
  );
  return (
    <>
      <CourtSurface />
      {TENNIS_COURTS.map((_, i) => (
        <RallyCourt
          key={i}
          index={i}
          shirts={DEMO_SHIRTS[i % DEMO_SHIRTS.length]}
          material={material}
          shadow={shadow}
          shadowTex={shadowTex}
          at={at}
        />
      ))}
    </>
  );
}
