"use client";

import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useState, type ComponentType } from "react";
import * as THREE from "three";

// DRAFT (map-3d-draft branch): a bench for designing the Tan Kah Kee statue
// at real size, 1 unit = 1 m. The statue stands on the origin and faces +Z.
// ?cam=x,y,z,tx,ty,tz sets the view. A grey 1.75 m figure stands beside it
// for scale.

const DEFAULT_CAM = [0, 4.2, 15, 0, 3.1, 0];

export default function StatueLab({ Statue, name }: { Statue: ComponentType; name: string }) {
  const [cam, setCam] = useState<number[] | null>(null);
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("cam")?.split(",").map(Number);
    setCam(v && v.length === 6 && !v.some(Number.isNaN) ? v : DEFAULT_CAM);
  }, []);
  if (!cam) return null;
  return (
    <main style={{ position: "fixed", inset: 0, background: "#c9d6e4" }}>
      <Canvas
        shadows
        camera={{ fov: 30, near: 0.1, far: 300, position: [cam[0], cam[1], cam[2]] }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NeutralToneMapping;
        }}
      >
        <color attach="background" args={["#c9d6e4"]} />
        <hemisphereLight args={["#eef4ff", "#8d8170", 0.9]} />
        <directionalLight
          position={[7, 14, 10]}
          intensity={2.4}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-8}
          shadow-camera-right={8}
          shadow-camera-top={10}
          shadow-camera-bottom={-2}
          shadow-bias={-0.0003}
        />
        <Environment resolution={128} frames={1}>
          <Lightformer form="rect" color="#dfe9f5" intensity={1.2} scale={[60, 60, 1]} position={[0, 30, 0]} />
          <Lightformer form="rect" color="#f4e2c8" intensity={2} scale={[60, 8, 1]} position={[0, 4, -30]} />
          <Lightformer form="rect" color="#cfe0f2" intensity={2} scale={[60, 8, 1]} position={[-30, 4, 0]} />
        </Environment>
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <circleGeometry args={[25, 64]} />
          <meshStandardMaterial color="#cfcac2" roughness={0.95} />
        </mesh>
        {/* 1.75 m person for scale */}
        <mesh position={[3, 0.875, 0.5]} castShadow>
          <capsuleGeometry args={[0.22, 1.31, 4, 12]} />
          <meshStandardMaterial color="#7f8792" roughness={0.9} />
        </mesh>
        <Statue />
        <OrbitControls makeDefault target={[cam[3], cam[4], cam[5]]} />
      </Canvas>
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          font: "600 13px system-ui, sans-serif",
          color: "#1d2733",
        }}
      >
        {name} · Tan Kah Kee statue lab · 1 unit = 1 m · grey figure = 1.75 m
      </div>
    </main>
  );
}
