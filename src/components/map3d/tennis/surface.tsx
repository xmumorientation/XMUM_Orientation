"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { SPEC } from "../courts";
import { SPORTS } from "../geo";
import { COURT, TENNIS_COURTS } from "./court";

// DRAFT: crisp tennis courts for the tennis game (docs/ROADMAP.md, item 9). The ground canvas paints the courts'
// lines half a metre wide and soft (one canvas covers the whole map), which reads from afar but blurs up close.
// Near the courts this draws the tennis block again over the paint: its paving, the three courts and thin lines,
// in that order in one mesh. It writes no depth, so each layer covers the one before. It fades out as the camera
// backs away, and the painted courts show again.

/** Line widths in metres: real lines are 5 cm and baselines up to 10 cm, a little wider here so they hold further off. */
const LINE = 0.07;
const BASELINE = 0.1;
/** Fully drawn within this distance of the camera (world units), gone beyond FADE_OUT. */
const FADE_IN = 25;
const FADE_OUT = 45;

const BLOCK = SPORTS.find((b) => b.sport === "tennis")!;

function surfaceGeometry() {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  // two triangles, wound to face up whichever way round the corners come
  const quad = (pts: [number, number][], color: string) => {
    c.set(color);
    const [a, b, d] = [pts[0], pts[1], pts[2]];
    const up = (b[1] - a[1]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[1] - a[1]) > 0;
    for (const i of up ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) {
      pos.push(pts[i][0], 0, pts[i][1]);
      col.push(c.r, c.g, c.b);
    }
  };
  const { x, z } = BLOCK;
  quad([[x[0], z[0]], [x[1], z[0]], [x[1], z[1]], [x[0], z[1]]], SPEC.tennis.area);
  for (const cell of TENNIS_COURTS) {
    const w = (along: number, across: number): [number, number] =>
      cell.alongX ? [cell.cx + along * cell.s, cell.cz + across * cell.s] : [cell.cx + across * cell.s, cell.cz + along * cell.s];
    const rect = (x0: number, z0: number, x1: number, z1: number, color: string) =>
      quad([w(x0, z0), w(x1, z0), w(x1, z1), w(x0, z1)], color);
    const { halfL: L, halfW: S } = COURT;
    const D = SPEC.tennis.W / 2;
    rect(-L, -D, L, D, SPEC.tennis.court);
    const ink = SPEC.tennis.line;
    for (const sgn of [-1, 1]) {
      rect(sgn * L - BASELINE / 2, -D, sgn * L + BASELINE / 2, D, ink); // baseline
      rect(sgn * L, -LINE / 2, sgn * (L - 0.3), LINE / 2, ink); // centre mark
      rect(-L, sgn * D - LINE / 2, L, sgn * D + LINE / 2, ink); // doubles sideline
      rect(-L, sgn * S - LINE / 2, L, sgn * S + LINE / 2, ink); // singles sideline
      rect(sgn * 6.4 - LINE / 2, -S, sgn * 6.4 + LINE / 2, S, ink); // service line
    }
    rect(-6.4, -LINE / 2, 6.4, LINE / 2, ink); // centre service line
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

const ease = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function CourtSurface() {
  const geo = useMemo(surfaceGeometry, []);
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -8,
      }),
    [],
  );
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  const mesh = useRef<THREE.Mesh>(null);
  const centre = useMemo(
    () => new THREE.Vector3((BLOCK.x[0] + BLOCK.x[1]) / 2, 0, (BLOCK.z[0] + BLOCK.z[1]) / 2),
    [],
  );
  useFrame(({ camera }) => {
    const o = 1 - ease(FADE_IN, FADE_OUT, camera.position.distanceTo(centre));
    mat.opacity = o;
    if (mesh.current) mesh.current.visible = o > 0;
  });
  // just over the ground; the polygon offset keeps it in front at map distances
  return <mesh ref={mesh} geometry={geo} material={mat} position-y={0.004} renderOrder={1} receiveShadow />;
}
