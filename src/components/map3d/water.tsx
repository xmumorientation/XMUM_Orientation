"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { BRIDGE, COLORS, DOME, DUCK, LAKE, type World } from "./geo";
import { makeWaterNormals } from "./textures";

// DRAFT: the lake (OSM outline). Clear water with moving ripples over the painted
// lakebed, lotus pads near the shore, and the crowned duck.

const WATER_Y = 0.08;

function lakeShape(pts: readonly World[]) {
  // same smoothing as the lakebed on the ground texture; shape y = -world z
  const w = pts.map(([x, z]) => new THREE.Vector2(x, -z));
  const mid = (a: THREE.Vector2, b: THREE.Vector2) => a.clone().add(b).multiplyScalar(0.5);
  const shape = new THREE.Shape();
  const start = mid(w[w.length - 1], w[0]);
  shape.moveTo(start.x, start.y);
  w.forEach((p, i) => {
    const m = mid(p, w[(i + 1) % w.length]);
    shape.quadraticCurveTo(p.x, p.y, m.x, m.y);
  });
  return shape;
}

export function Lakes() {
  const normals = useMemo(() => {
    const t = makeWaterNormals();
    t.repeat.set(0.035, 0.035);
    return t;
  }, []);
  const geos = useMemo(
    () => [new THREE.ShapeGeometry(lakeShape(LAKE), 24).rotateX(-Math.PI / 2)],
    [],
  );
  useFrame((_, dt) => {
    normals.offset.x += dt * 0.012;
    normals.offset.y += dt * 0.007;
  });
  return (
    <>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} position-y={WATER_Y} receiveShadow>
          <meshStandardMaterial
            color="#8fd3f2"
            transparent
            opacity={0.62}
            roughness={0.16}
            metalness={0.1}
            normalMap={normals}
            normalScale={new THREE.Vector2(0.18, 0.18)}
            envMapIntensity={1.4}
          />
        </mesh>
      ))}
      <Lotus />
    </>
  );
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function lotusSpots() {
  let seed = 23;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const [dx, dz] = DUCK.pos;
  const [cx0, cz0] = DOME;
  const [[ax, az], [bx, bz]] = BRIDGE;
  const out: { x: number; z: number; s: number; rot: number; flower: boolean }[] = [];
  for (const w of [LAKE]) {
    const cx = w.reduce((s, p) => s + p[0], 0) / w.length;
    const cz = w.reduce((s, p) => s + p[1], 0) / w.length;
    for (let k = 0; k < 60 && out.length < 70; k++) {
      const i = Math.floor(r() * w.length);
      const [p, q] = [w[i], w[(i + 1) % w.length]];
      const u = r();
      const ex = p[0] + (q[0] - p[0]) * u;
      const ez = p[1] + (q[1] - p[1]) * u;
      const f = 0.82 + r() * 0.1;
      const x = cx + (ex - cx) * f;
      const z = cz + (ez - cz) * f;
      if (Math.hypot(x - dx, z - dz) < 8.5 * DUCK.scale) continue;
      if (Math.hypot(x - cx0, z - cz0) < 5) continue;
      if (distToSegment(x, z, ax, az, bx, bz) < 2.4) continue;
      // small clusters
      for (let c = 0; c < 3; c++) {
        out.push({
          x: x + (r() - 0.5) * 1.6,
          z: z + (r() - 0.5) * 1.6,
          s: 0.6 + r() * 0.6,
          rot: r() * 6.28,
          flower: r() < 0.22,
        });
      }
    }
  }
  return out;
}

function Lotus() {
  const spots = useMemo(lotusSpots, []);
  const flowers = useMemo(() => spots.filter((s) => s.flower), [spots]);
  const pads = useRef<THREE.InstancedMesh>(null);
  const blooms = useRef<THREE.InstancedMesh>(null);
  const padGeo = useMemo(() => new THREE.CylinderGeometry(0.5, 0.5, 0.04, 16, 1, false, 0.3, Math.PI * 2 - 0.6), []);
  const bloomGeo = useMemo(() => new THREE.ConeGeometry(0.22, 0.32, 7).rotateX(Math.PI).translate(0, 0.2, 0), []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    spots.forEach((s, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot);
      m.compose(new THREE.Vector3(s.x, WATER_Y + 0.03, s.z), q, new THREE.Vector3(s.s, 1, s.s));
      pads.current!.setMatrixAt(i, m);
      pads.current!.setColorAt(i, c.setHSL(0.28 + (i % 5) * 0.012, 0.45, 0.32 + (i % 3) * 0.04));
    });
    flowers.forEach((s, i) => {
      m.compose(new THREE.Vector3(s.x, WATER_Y, s.z), q.identity(), new THREE.Vector3(1, 1, 1));
      blooms.current!.setMatrixAt(i, m);
    });
    for (const r of [pads, blooms]) r.current!.instanceMatrix.needsUpdate = true;
    if (pads.current!.instanceColor) pads.current!.instanceColor.needsUpdate = true;
  }, [spots, flowers]);
  return (
    <>
      <instancedMesh ref={pads} args={[padGeo, undefined, spots.length]} receiveShadow>
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={blooms} args={[bloomGeo, undefined, flowers.length]}>
        <meshStandardMaterial color="#f6a6c4" roughness={0.5} emissive="#f6a6c4" emissiveIntensity={0.15} />
      </instancedMesh>
    </>
  );
}

// ── The crowned duck, bobbing, with ripples ──────────────────────────────
export function Duck() {
  const bob = useRef<THREE.Group>(null);
  const ripples = useRef<(THREE.Mesh | null)[]>([]);
  const ringGeo = useMemo(() => new THREE.RingGeometry(0.975, 1, 64).rotateX(-Math.PI / 2), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (bob.current) {
      bob.current.position.y = Math.sin(t * 1.3) * 0.12;
      bob.current.rotation.z = Math.sin(t * 0.9) * 0.025;
      bob.current.rotation.x = Math.sin(t * 1.1 + 1) * 0.02;
    }
    ripples.current.forEach((m, i) => {
      if (!m) return;
      const p = (t * 0.18 + i / 3) % 1;
      const s = 6.5 + p * 7;
      m.scale.set(s * 1.25, 1, s);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.22 * (1 - p) * Math.min(1, p * 6);
    });
  });
  const white = { color: COLORS.duck, roughness: 0.55 };
  const [dx, dz] = DUCK.pos;
  return (
    <group position={[dx, 0, dz]} rotation-y={Math.PI / 4} scale={DUCK.scale}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(m) => void (ripples.current[i] = m)} geometry={ringGeo} position={[0.6, WATER_Y + 0.02, 0]}>
          <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      <group ref={bob}>
        <mesh position={[0.6, 1.2, 0]} scale={[6, 2.7, 4.2]} castShadow>
          <sphereGeometry args={[1, 32, 20]} />
          <meshStandardMaterial {...white} />
        </mesh>
        <mesh position={[6.1, 2.3, 0]} rotation-z={-1.1} castShadow>
          <coneGeometry args={[1.3, 2.8, 16]} />
          <meshStandardMaterial {...white} />
        </mesh>
        {/* folded wings */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[1.6, 2.2, s * 3.2]} rotation-x={s * -0.35} scale={[3.6, 1.1, 0.9]} castShadow>
            <sphereGeometry args={[1, 20, 12]} />
            <meshStandardMaterial {...white} />
          </mesh>
        ))}
        <mesh position={[-3.7, 3.9, 0]} rotation-z={0.2} castShadow>
          <cylinderGeometry args={[1.05, 1.6, 3.6, 20]} />
          <meshStandardMaterial {...white} />
        </mesh>
        <mesh position={[-4.1, 6.3, 0]} castShadow>
          <sphereGeometry args={[1.8, 28, 20]} />
          <meshStandardMaterial {...white} />
        </mesh>
        <mesh position={[-6.2, 6.0, 0]} rotation-z={Math.PI / 2} scale={[1, 1, 0.7]} castShadow>
          <coneGeometry args={[0.8, 1.8, 16]} />
          <meshStandardMaterial color={COLORS.beak} roughness={0.5} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[-5.2, 6.9, s * 1.05]}>
            <sphereGeometry args={[0.28, 12, 10]} />
            <meshStandardMaterial color={COLORS.black} roughness={0.2} />
          </mesh>
        ))}
        {/* blush */}
        {[-1, 1].map((s) => (
          <mesh key={`b${s}`} position={[-4.9, 6.15, s * 1.45]} scale={[0.45, 0.25, 0.1]}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial color="#f7a8b8" roughness={0.6} />
          </mesh>
        ))}
        <group position={[-4.1, 8.0, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[1.25, 1.1, 0.7, 24, 1, true]} />
            <meshStandardMaterial color={COLORS.crown} metalness={0.7} roughness={0.25} side={THREE.DoubleSide} />
          </mesh>
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2;
            return (
              <group key={i} position={[Math.cos(a) * 1.15, 0.65, Math.sin(a) * 1.15]}>
                <mesh castShadow>
                  <coneGeometry args={[0.3, 0.7, 6]} />
                  <meshStandardMaterial color={COLORS.crown} metalness={0.7} roughness={0.25} />
                </mesh>
                <mesh position={[0, 0.42, 0]}>
                  <sphereGeometry args={[0.1, 8, 6]} />
                  <meshStandardMaterial color={i % 2 ? "#e3000f" : "#2f80ed"} roughness={0.2} metalness={0.3} />
                </mesh>
              </group>
            );
          })}
        </group>
      </group>
    </group>
  );
}
