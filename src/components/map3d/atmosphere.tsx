"use client";

import { Environment, Lightformer, Stars } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, TiltShift2, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// DRAFT: time of day. Sky, sun, reflections, clouds, stars and the
// finishing effects (full mode only) for each mode.

export type Mode = "sunset" | "day" | "night";

export type ModeLook = {
  label: string;
  skyTop: string;
  skyHorizon: string;
  skyBottom: string;
  sunGlow: string;
  sun: string;
  sunIntensity: number;
  sunPos: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  env: number;
  windows: number;
  lamps: number;
  bloom: [number, number]; // intensity, threshold
  clouds: string | null;
  stars: boolean;
};

export const MODES: Record<Mode, ModeLook> = {
  sunset: {
    label: "Sunset",
    skyTop: "#2a3b78",
    skyHorizon: "#f3a27a",
    skyBottom: "#2a2342",
    sunGlow: "#ffd08a",
    sun: "#ffc490",
    sunIntensity: 2.5,
    sunPos: [-80, 34, 22],
    hemiSky: "#ffe2cc",
    hemiGround: "#4d3d57",
    hemiIntensity: 1.05,
    env: 0.5,
    windows: 0.55,
    lamps: 1.2,
    bloom: [0.55, 0.85],
    clouds: "#ffd3c4",
    stars: false,
  },
  day: {
    label: "Day",
    skyTop: "#3a8ad4",
    skyHorizon: "#d4ecfa",
    skyBottom: "#7ea7c8",
    sunGlow: "#fff6d8",
    sun: "#fff3df",
    sunIntensity: 2.7,
    sunPos: [40, 95, 30],
    hemiSky: "#e3f2ff",
    hemiGround: "#7a8456",
    hemiIntensity: 1.15,
    env: 0.6,
    windows: 0,
    lamps: 0,
    bloom: [0.2, 0.95],
    clouds: "#ffffff",
    stars: false,
  },
  night: {
    label: "Night",
    skyTop: "#05081a",
    skyHorizon: "#272a63",
    skyBottom: "#04050f",
    sunGlow: "#9fb3ff",
    sun: "#a8bcff",
    sunIntensity: 0.7,
    sunPos: [40, 80, -30],
    hemiSky: "#5464b0",
    hemiGround: "#141424",
    hemiIntensity: 0.5,
    env: 0.18,
    windows: 1.7,
    lamps: 4,
    bloom: [1.1, 0.55],
    clouds: null,
    stars: true,
  },
};

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 bottom;
uniform vec3 glow;
uniform vec3 sunDir;
varying vec3 vDir;
void main() {
  float h = vDir.y;
  vec3 col = h > 0.0
    ? mix(horizon, top, smoothstep(-0.02, 0.3, h))
    : mix(horizon, bottom, smoothstep(-0.12, -0.75, h));
  float s = max(dot(normalize(vDir), sunDir), 0.0);
  col += glow * (pow(s, 48.0) * 0.8 + pow(s, 6.0) * 0.25);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

function Sky({ look }: { look: ModeLook }) {
  const ref = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(
    () => ({
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      bottom: { value: new THREE.Color() },
      glow: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3() },
    }),
    [],
  );
  uniforms.top.value.set(look.skyTop);
  uniforms.horizon.value.set(look.skyHorizon);
  uniforms.bottom.value.set(look.skyBottom);
  uniforms.glow.value.set(look.sunGlow);
  uniforms.sunDir.value.set(...look.sunPos).normalize();
  useFrame(({ camera }) => ref.current?.position.copy(camera.position));
  return (
    <mesh ref={ref} renderOrder={-1}>
      <sphereGeometry args={[700, 32, 16]} />
      <shaderMaterial
        vertexShader={SKY_VERT}
        fragmentShader={SKY_FRAG}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function cloudGeometry(seed: number) {
  let s = seed;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const parts = Array.from({ length: 5 + Math.floor(r() * 3) }, (_, i) => {
    const rad = 2.2 + r() * 2;
    return new THREE.IcosahedronGeometry(rad, 1)
      .scale(1, 0.7, 1)
      .translate((i - 3) * 2.6 + r() * 1.5, r() * 1.2, (r() - 0.5) * 3);
  });
  return mergeGeometries(parts)!;
}

function Clouds({ color }: { color: string }) {
  const group = useRef<THREE.Group>(null);
  const clouds = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        geo: cloudGeometry(i * 97 + 13),
        u: -170 + i * 45,
        y: 22 + (i % 3) * 7,
        back: 120 + (i % 2) * 25,
        scale: 1 + (i % 3) * 0.25,
      })),
    [],
  );
  useFrame((_, dt) => {
    group.current?.children.forEach((c, i) => {
      const d = clouds[i];
      d.u += dt * 1.4;
      if (d.u > 190) d.u = -190;
      // drift along the far side of the campus, across the view
      c.position.set(-d.back * 0.707 + d.u * 0.707, d.y, -d.back * 0.707 - d.u * 0.707);
    });
  });
  return (
    <group ref={group}>
      {clouds.map((c, i) => (
        <mesh key={i} geometry={c.geo} scale={c.scale}>
          <meshStandardMaterial color={color} flatShading roughness={1} emissive={color} emissiveIntensity={0.25} />
        </mesh>
      ))}
    </group>
  );
}

/** `lite` (phones): a smaller shadow map and no stars. */
export function Atmosphere({ look, mode, lite = false }: { look: ModeLook; mode: Mode; lite?: boolean }) {
  const shadowMap = lite ? 1024 : 2048;
  const sunDir = new THREE.Vector3(...look.sunPos).normalize();
  return (
    <>
      <Sky look={look} />
      <hemisphereLight args={[look.hemiSky, look.hemiGround, look.hemiIntensity]} />
      <directionalLight
        position={look.sunPos}
        color={look.sun}
        intensity={look.sunIntensity}
        castShadow
        shadow-mapSize={[shadowMap, shadowMap]}
        shadow-camera-left={-95}
        shadow-camera-right={95}
        shadow-camera-top={95}
        shadow-camera-bottom={-95}
        shadow-camera-far={400}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <Environment key={mode} resolution={128} frames={1} environmentIntensity={look.env}>
        <Lightformer form="rect" color={look.skyTop} intensity={1.2} scale={[400, 400, 1]} position={[0, 120, 0]} />
        <Lightformer form="rect" color={look.skyHorizon} intensity={2} scale={[400, 40, 1]} position={[0, 15, -180]} />
        <Lightformer form="rect" color={look.skyHorizon} intensity={2} scale={[400, 40, 1]} position={[-180, 15, 0]} />
        <Lightformer
          form="circle"
          color={look.sunGlow}
          intensity={6}
          scale={30}
          position={sunDir.clone().multiplyScalar(160).toArray()}
        />
      </Environment>
      {look.clouds && <Clouds color={look.clouds} />}
      {look.stars && !lite && <Stars radius={300} depth={80} count={3000} factor={7} saturation={0} fade speed={0.4} />}
    </>
  );
}

/** Ambient occlusion, glow, a light tilt-shift (miniature look) and tone mapping. */
export function Effects({ look }: { look: ModeLook }) {
  return (
    <EffectComposer multisampling={4}>
      <N8AO aoRadius={2.5} intensity={2.2} distanceFalloff={1.5} halfRes quality="medium" />
      <Bloom mipmapBlur intensity={look.bloom[0]} luminanceThreshold={look.bloom[1]} luminanceSmoothing={0.2} />
      <TiltShift2 blur={0.09} taper={0.5} start={[0, 0.56]} end={[1, 0.56]} samples={8} />
      <Vignette offset={0.3} darkness={0.45} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  );
}
