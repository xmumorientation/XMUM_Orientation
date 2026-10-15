"use client";

import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useState, type ComponentType } from "react";
import * as THREE from "three";

// DRAFT (map-3d-draft branch): a bench for the Vortexa Funfair ride styles,
// 1 unit = 1 m. ?power=0|1 switches the rides off or on, ?mode=day|night the
// light, ?cam=x,y,z,tx,ty,tz the view. A grey 1.75 m figure stands at the
// origin for scale.

export type FunfairStyleProps = { power: number; night: boolean };

const DEFAULT_CAM = [70, 45, 70, 0, 12, 0];

export default function FunfairLab({ Rides, name }: { Rides: ComponentType<FunfairStyleProps>; name: string }) {
  const [q, setQ] = useState<{ cam: number[]; power: number; night: boolean } | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const v = p.get("cam")?.split(",").map(Number);
    setQ({
      cam: v && v.length === 6 && !v.some(Number.isNaN) ? v : DEFAULT_CAM,
      power: p.get("power") === "0" ? 0 : 1,
      night: p.get("mode") === "night",
    });
  }, []);
  if (!q) return null;
  const bg = q.night ? "#0b0a1a" : "#c9d6e4";
  return (
    <main style={{ position: "fixed", inset: 0, background: bg }}>
      <Canvas
        shadows
        camera={{ fov: 35, near: 0.5, far: 1000, position: [q.cam[0], q.cam[1], q.cam[2]] }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NeutralToneMapping;
        }}
      >
        <color attach="background" args={[bg]} />
        <hemisphereLight args={[q.night ? "#3a3f7a" : "#eef4ff", "#5a4e44", q.night ? 0.25 : 0.9]} />
        <directionalLight
          position={[60, 90, 40]}
          intensity={q.night ? 0.25 : 2.4}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-80}
          shadow-camera-right={80}
          shadow-camera-top={80}
          shadow-camera-bottom={-80}
          shadow-camera-far={300}
        />
        <Environment resolution={128} frames={1} environmentIntensity={q.night ? 0.25 : 1}>
          <Lightformer form="rect" color="#dfe9f5" intensity={1.2} scale={[300, 300, 1]} position={[0, 100, 0]} />
          <Lightformer form="rect" color="#f4e2c8" intensity={2} scale={[300, 30, 1]} position={[0, 10, -150]} />
        </Environment>
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <circleGeometry args={[140, 64]} />
          <meshStandardMaterial color={q.night ? "#2a2433" : "#b98a63"} roughness={0.95} />
        </mesh>
        <mesh position={[0, 0.875, 0]} castShadow>
          <capsuleGeometry args={[0.22, 1.31, 4, 12]} />
          <meshStandardMaterial color="#7f8792" roughness={0.9} />
        </mesh>
        <Rides power={q.power} night={q.night} />
        <OrbitControls makeDefault target={[q.cam[3], q.cam[4], q.cam[5]]} />
        <EffectComposer>
          <Bloom intensity={q.night ? 1.1 : 0.4} luminanceThreshold={0.75} mipmapBlur />
        </EffectComposer>
      </Canvas>
      <div style={{ position: "absolute", top: 12, left: 12, font: "600 13px system-ui, sans-serif", color: q.night ? "#fff" : "#1d2733" }}>
        {name} · Vortexa Funfair lab · power {q.power ? "on" : "off"} · 1 unit = 1 m
      </div>
    </main>
  );
}
