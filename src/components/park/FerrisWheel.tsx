"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { NEON } from "./palette";
import { scroll } from "./scrollStore";

type Props = {
  position?: [number, number, number];
  mobile?: boolean;
  reduced?: boolean;
};

/**
 * The park's main visual anchor. Procedural geometry only: two neon rims, a
 * hub, radial spokes and orbiting cabins. Cabins live in pivot groups that
 * counter-rotate each frame so they hang upright while the wheel spins.
 */
export function FerrisWheel({ position = [0, 16, -46], mobile = false, reduced = false }: Props) {
  const wheelRef = useRef<THREE.Group>(null);
  const cabinPivots = useRef<THREE.Group[]>([]);

  const radius = mobile ? 11 : 14;
  const cabinCount = mobile ? 8 : 14;

  // One node per cabin, evenly spaced around the rim.
  const nodes = useMemo(
    () =>
      Array.from({ length: cabinCount }, (_, i) => {
        const a = (i / cabinCount) * Math.PI * 2;
        return { a, x: Math.cos(a) * radius, y: Math.sin(a) * radius };
      }),
    [cabinCount, radius]
  );

  useFrame((state, delta) => {
    const wheel = wheelRef.current;
    if (!wheel) return;

    // Idle drift keeps the scene alive; scroll adds a directed turn.
    const idle = reduced ? 0 : state.clock.elapsedTime * 0.05;
    const scrolled = scroll.current * Math.PI * 1.5;
    wheel.rotation.z = -(idle + scrolled);

    // Keep cabins upright regardless of wheel angle.
    for (const pivot of cabinPivots.current) {
      if (pivot) pivot.rotation.z = -wheel.rotation.z;
    }
  });

  const rimColor = NEON.cyan;
  const spokeColor = NEON.purple;

  return (
    <group position={position}>
      <group ref={wheelRef}>
        {/* Twin rims, front and back */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[0, 0, side * 1.1]}>
            <torusGeometry args={[radius, 0.18, 12, 96]} />
            <meshStandardMaterial
              color={rimColor}
              emissive={rimColor}
              emissiveIntensity={2.4}
              toneMapped={false}
            />
          </mesh>
        ))}

        {/* Hub */}
        <mesh>
          <cylinderGeometry args={[1.1, 1.1, 2.6, 20]} />
          <meshStandardMaterial
            color={NEON.purple}
            emissive={NEON.purple}
            emissiveIntensity={1.6}
            toneMapped={false}
          />
        </mesh>

        {/* Spokes */}
        {nodes.map((n, i) => {
          const len = radius;
          return (
            <mesh
              key={`spoke-${i}`}
              position={[n.x / 2, n.y / 2, 0]}
              rotation={[0, 0, n.a - Math.PI / 2]}
            >
              <boxGeometry args={[0.06, len, 0.06]} />
              <meshStandardMaterial
                color={spokeColor}
                emissive={spokeColor}
                emissiveIntensity={1.1}
                toneMapped={false}
              />
            </mesh>
          );
        })}

        {/* Cabins — orbit with the rim, kept upright by counter-rotation */}
        {nodes.map((n, i) => {
          const cabinColor = i % 2 === 0 ? NEON.cyan : NEON.pink;
          return (
            <group
              key={`cabin-${i}`}
              position={[n.x, n.y, 0]}
              ref={(el) => {
                if (el) cabinPivots.current[i] = el;
              }}
            >
              <mesh position={[0, -0.9, 0]}>
                <boxGeometry args={[1.5, 1.2, 2.2]} />
                <meshStandardMaterial
                  color={cabinColor}
                  emissive={cabinColor}
                  emissiveIntensity={1.35}
                  toneMapped={false}
                />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* A-frame support legs */}
      {[-1, 1].map((side) => (
        <mesh
          key={`leg-${side}`}
          position={[side * radius * 0.5, -radius, 0]}
          rotation={[0, 0, side * 0.32]}
        >
          <boxGeometry args={[0.5, radius * 2.1, 0.5]} />
          <meshStandardMaterial
            color={NEON.panel}
            emissive={NEON.purple}
            emissiveIntensity={0.35}
            metalness={0.6}
            roughness={0.4}
          />
        </mesh>
      ))}
    </group>
  );
}
