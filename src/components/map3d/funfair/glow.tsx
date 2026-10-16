"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { UNITS_PER_M } from "../geo";
import { smooth } from "./central/kit";

// Phones (lite) draw the funfair without bloom, so at night a powered zone
// hardly stands out from map distances. These soft halos stand in for the
// bloom: one additive point per landmark, all of a zone's in one draw call.
// They show at night once the zone's lights are on, and fade out close up,
// where the lights themselves read.

/** A halo: its centre in the zone's metres (inside the zone's group), its radius in metres, its colour. */
export type GlowSpot = { p: [number, number, number]; r: number; c: string };

/** Halos fade in between these camera distances (world units). */
const FADE_NEAR = 45;
const FADE_FAR = 110;
/** Strength of a halo at full power, at night. */
const STRENGTH = 0.9;
/** At sunset, phones show the halos and light pools at this share of their night strength. */
export const DUSK_SHARE = 0.4;

/** How strong the halos are for the look: full at night, weaker at sunset, none by day. */
export const glowStrength = (night: boolean, dusk = false) => (night ? 1 : dusk ? DUSK_SHARE : 0);

const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uScale, uMax;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = max(-mv.z, 0.001);
    gl_PointSize = min(uMax, aSize * uScale / depth);
    vColor = aColor;
    vFade = smoothstep(${FADE_NEAR.toFixed(1)}, ${FADE_FAR.toFixed(1)}, depth);
  }`;

const FRAG = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = pow(max(0.0, 1.0 - d), 2.2) * uOpacity * vFade;
    gl_FragColor = vec4(vColor * a, 1.0);
  }`;

/**
 * The halos of one zone. Render it inside the zone's group (metres), in lite only. `power` reads the zone's shown
 * power (0..1) each frame; `strength` comes from glowStrength().
 */
export function LiteGlow({ spots, power, strength }: { spots: GlowSpot[]; power: () => number; strength: number }) {
  const gl = useThree((s) => s.gl);
  const points = useMemo(() => {
    const pos = new Float32Array(spots.length * 3);
    const size = new Float32Array(spots.length);
    const color = new Float32Array(spots.length * 3);
    const c = new THREE.Color();
    spots.forEach((s, i) => {
      pos.set(s.p, i * 3);
      // world diameter: the group's scale doesn't reach gl_PointSize
      size[i] = 2 * s.r * UNITS_PER_M;
      c.set(s.c);
      color.set([c.r, c.g, c.b], i * 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
    const range = gl.getContext().getParameter(gl.getContext().ALIASED_POINT_SIZE_RANGE) as Float32Array | null;
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 1 }, uMax: { value: range?.[1] ?? 256 }, uOpacity: { value: 0 } },
      transparent: true,
      depthWrite: false,
      // like bloom, a halo shines over whatever stands in front of it
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const p = new THREE.Points(geometry, material);
    p.frustumCulled = false;
    p.renderOrder = 4;
    p.visible = false;
    return p;
  }, [spots, gl]);
  useEffect(
    () => () => {
      points.geometry.dispose();
      (points.material as THREE.Material).dispose();
    },
    [points],
  );

  useFrame(({ camera, size, viewport }) => {
    const u = (points.material as THREE.ShaderMaterial).uniforms;
    const opacity = STRENGTH * strength * smooth(0.45, 1, power());
    u.uOpacity.value = opacity;
    points.visible = opacity > 0.01;
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 30;
    // pixels per world unit at distance 1, in drawing-buffer pixels
    u.uScale.value = (size.height * viewport.dpr) / (2 * Math.tan((fov * Math.PI) / 360));
  });

  return <primitive object={points} />;
}
