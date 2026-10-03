"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Grid, Stars } from "@react-three/drei";
import * as THREE from "three";

import { NEON } from "./palette";
import { scroll } from "./scrollStore";

type Props = {
  mobile?: boolean;
  reduced?: boolean;
};

/** A single neon-outlined carnival booth built from a dark box + a glowing roof. */
function Booth({
  position,
  color,
  scale = [3, 3, 3],
}: {
  position: [number, number, number];
  color: string;
  scale?: [number, number, number];
}) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={NEON.panel} metalness={0.3} roughness={0.7} />
      </mesh>
      {/* Glowing roof trim */}
      <mesh position={[0, 1.05, 0]}>
        <boxGeometry args={[1.15, 0.12, 1.15]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/** The gate the camera flies through, framed by two neon pillars and a sign bar. */
function EntranceArch() {
  return (
    <group position={[0, 0, -12]}>
      {[-5, 5].map((x) => (
        <mesh key={x} position={[x, 5, 0]}>
          <boxGeometry args={[0.6, 10, 0.6]} />
          <meshStandardMaterial
            color={NEON.cyan}
            emissive={NEON.cyan}
            emissiveIntensity={2}
            toneMapped={false}
          />
        </mesh>
      ))}
      {/* Top beam */}
      <mesh position={[0, 10, 0]}>
        <boxGeometry args={[11, 0.7, 0.7]} />
        <meshStandardMaterial
          color={NEON.pink}
          emissive={NEON.pink}
          emissiveIntensity={2.2}
          toneMapped={false}
        />
      </mesh>
      {/* Sign panel */}
      <mesh position={[0, 8.6, 0]}>
        <boxGeometry args={[7, 1.4, 0.15]} />
        <meshStandardMaterial
          color={NEON.purple}
          emissive={NEON.purple}
          emissiveIntensity={1.1}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export function NeonEnvironment({ mobile = false, reduced = false }: Props) {
  const glowLight = useRef<THREE.PointLight>(null);
  const wheelLight = useRef<THREE.PointLight>(null);

  // Booth layout deepens the scene along -Z so there is somewhere to fly into.
  const booths = useMemo(() => {
    const list: { position: [number, number, number]; color: string }[] = [];
    const colors = [NEON.cyan, NEON.purple, NEON.pink];
    const count = mobile ? 4 : 7;
    for (let i = 0; i < count; i++) {
      const z = -18 - i * 6;
      const x = (i % 2 === 0 ? -1 : 1) * (7 + (i % 3));
      list.push({ position: [x, 0, z], color: colors[i % colors.length] });
    }
    return list;
  }, [mobile]);

  useFrame(() => {
    // Scroll drives how "lit up" the park feels: dim from afar, bright inside.
    const lit = 0.4 + scroll.current * 1.6;
    if (glowLight.current) glowLight.current.intensity = 40 * lit;
    if (wheelLight.current) wheelLight.current.intensity = 60 * (0.5 + scroll.current);
  });

  return (
    <group>
      {/* Base + atmospheric fill lighting (kept minimal for performance) */}
      <ambientLight intensity={0.12} color={NEON.purple} />
      <hemisphereLight intensity={0.15} color={NEON.cyan} groundColor={NEON.deep} />
      <pointLight ref={glowLight} position={[0, 6, -12]} color={NEON.cyan} intensity={40} distance={70} decay={2} />
      <pointLight ref={wheelLight} position={[0, 16, -46]} color={NEON.purple} intensity={60} distance={120} decay={2} />
      <pointLight position={[-12, 4, -30]} color={NEON.pink} intensity={18} distance={45} decay={2} />

      {/* Neon grid floor */}
      <Grid
        position={[0, 0, -30]}
        args={[200, 200]}
        cellSize={2}
        cellThickness={0.6}
        cellColor={NEON.purple}
        sectionSize={10}
        sectionThickness={1.2}
        sectionColor={NEON.cyan}
        fadeDistance={mobile ? 70 : 110}
        fadeStrength={2}
        infiniteGrid
        followCamera={false}
      />

      <EntranceArch />

      {booths.map((b, i) => (
        <Booth key={i} position={b.position} color={b.color} scale={[3, 3, 3]} />
      ))}

      {/* Faint depth stars — desktop only, low count to avoid clutter */}
      {!mobile && !reduced && (
        <Stars radius={120} depth={40} count={800} factor={3} saturation={0} fade speed={0.4} />
      )}
    </group>
  );
}
