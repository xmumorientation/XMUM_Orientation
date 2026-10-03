"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { scroll } from "./scrollStore";

type Props = {
  /** When false (reduced motion), the camera holds one composed shot. */
  enabled?: boolean;
};

// Camera flight path: start far in +Z, glide through the entrance (z=-12) and
// settle among the park before pulling back to reveal everything. Non-uniform
// spacing gives the move natural acceleration/deceleration.
const POSITION_WAYPOINTS: [number, number, number][] = [
  [0, 3.5, 34],
  [0, 3, 22],
  [0, 2.6, 10],
  [0, 3.2, -2],
  [0, 5, -16],
  [7, 6, -30],
  [-6, 7.5, -40],
  [0, 12, -22],
];

const LOOKAT_WAYPOINTS: [number, number, number][] = [
  [0, 4, -12],
  [0, 5, -14],
  [0, 6, -16],
  [0, 7, -20],
  [0, 13, -46],
  [0, 13, -46],
  [0, 13, -46],
  [0, 11, -42],
];

/** Piecewise-linear interpolation across an array of vectors by t in [0,1]. */
function sampleWaypoints(points: THREE.Vector3[], t: number, out: THREE.Vector3) {
  const clamped = Math.min(Math.max(t, 0), 1);
  const scaled = clamped * (points.length - 1);
  const i = Math.min(Math.floor(scaled), points.length - 2);
  const f = scaled - i;
  return out.copy(points[i]).lerp(points[i + 1], f);
}

// Smootherstep — eases the raw scroll param so starts/stops feel filmic.
function easeInOut(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function CameraController({ enabled = true }: Props) {
  const { camera } = useThree();

  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        POSITION_WAYPOINTS.map((p) => new THREE.Vector3(...p)),
        false,
        "catmullrom",
        0.5
      ),
    []
  );
  const lookPoints = useMemo(
    () => LOOKAT_WAYPOINTS.map((p) => new THREE.Vector3(...p)),
    []
  );

  const pos = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());
  const initialised = useRef(false);

  useFrame((state, delta) => {
    if (!enabled) {
      // Reduced motion: compose one representative static shot, once.
      if (!initialised.current) {
        const t = 0.5;
        camera.position.copy(curve.getPoint(easeInOut(t)));
        sampleWaypoints(lookPoints, t, look.current);
        camera.lookAt(look.current);
        initialised.current = true;
      }
      return;
    }

    // Ease the shared scroll value toward its target (frame-rate independent).
    scroll.current = THREE.MathUtils.damp(scroll.current, scroll.target, 3.2, delta);
    const t = easeInOut(Math.min(Math.max(scroll.current, 0), 1));

    curve.getPoint(t, pos.current);
    // Subtle handheld drift keeps the shot alive without distracting.
    const drift = state.clock.elapsedTime;
    pos.current.x += Math.sin(drift * 0.35) * 0.35;
    pos.current.y += Math.cos(drift * 0.27) * 0.22;
    camera.position.copy(pos.current);

    sampleWaypoints(lookPoints, t, look.current);
    camera.lookAt(look.current);
  });

  return null;
}
