"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { POLE_H } from "./decor";
import { groundY } from "./ground";
import { Bake, G, PAINT, mat, rng, starPoints, type Kit, type V3 } from "./kit";
import { CROSSING, FOUNTAIN, POWER_BOX } from "./layout";
import { disposeAll, tAt, type Board, type Live, type Pool } from "./parts";

// DRAFT: the Central zone's power look that isn't baked: the power box's
// standby light and sparks, the CLOSED/OPEN boards, light pools, the turning
// Starlight star and the fountain's jets.

const _c = new THREE.Color();
const RED = new THREE.Color("#ff2a2a");
const ON = new THREE.Color("#38fff0");

function boardTexture() {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 256;
  const g = cv.getContext("2d")!;
  const half = (y: number, bg: string, fg: string, text: string) => {
    g.fillStyle = bg;
    g.fillRect(0, y, 256, 128);
    g.strokeStyle = fg;
    g.lineWidth = 10;
    g.strokeRect(9, y + 9, 238, 110);
    g.fillStyle = fg;
    g.font = "900 54px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 128, y + 66);
  };
  half(0, "#f4e9d6", "#c8202e", "CLOSED");
  half(128, "#0b2a52", "#3ff6ff", "OPEN");
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(1, 0.5);
  t.offset.set(0, 0.5);
  return t;
}

/** The boards' faces: one front and one back leaf per A-frame. */
function boardGeometry(boards: Board[]) {
  const list: THREE.BufferGeometry[] = [];
  for (const b of boards) {
    const y = groundY(b.x, b.z);
    for (const side of [1, -1]) {
      const g = new THREE.PlaneGeometry(1.7, 1.15);
      // face +x (or -x for the back leaf), leaning in to the top
      g.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
      g.rotateZ(side * 0.24);
      g.translate(side * 0.3, y + 1.35, 0);
      g.rotateY(b.ry);
      g.translate(b.x, 0, b.z);
      list.push(g);
    }
  }
  const out = list.length ? mergeGeometries(list)! : new THREE.BufferGeometry();
  disposeAll(list);
  return out;
}

export function PowerFx({ kit, live, night, lite, boards, pools }: { kit: Kit; live: RefObject<Live>; night: boolean; lite: boolean; boards: Board[]; pools: Pool[] }) {
  const star = useRef<THREE.Group>(null);
  const jets = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const halo = useRef<THREE.Sprite>(null);
  const prev = useRef(live.current?.p ?? 0);

  const parts = useMemo(() => {
    const tex = boardTexture();
    const boardMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: "#ffffff", emissiveIntensity: 0, roughness: 0.8, side: THREE.DoubleSide });
    const board = boardGeometry(boards);

    const plane = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const poolMesh = new THREE.InstancedMesh(plane, kit.pool, Math.max(1, pools.length));
    pools.forEach((pl, i) => {
      poolMesh.setMatrixAt(i, mat(pl.x, groundY(pl.x, pl.z) + 0.15, pl.z, pl.r, 1, pl.r));
      poolMesh.setColorAt(i, _c.set(pl.c));
    });
    poolMesh.count = pools.length;
    poolMesh.frustumCulled = false;
    poolMesh.renderOrder = 2;

    // the Starlight star: a fat yellow star with a cyan outline, both glowing
    const s = new Bake();
    const t0 = tAt(CROSSING[0], CROSSING[1]) + 0.05;
    s.add(G.star, mat(0, 0, 0, 2.6, 2.6, 0.9), PAINT.yellow, t0);
    const pts = starPoints(0.45).map(([a, b]) => [a * 3.2, b * 3.2, 0] as V3);
    for (let i = 0; i < pts.length; i++) s.seg(PAINT.cyan, pts[i], pts[(i + 1) % pts.length], 0.3, G.cyl6, t0 + 0.04);
    const starGeo = s.geometry();

    // fountain jets: a tall middle jet and a ring of small arcs
    const j = new Bake();
    j.add(G.cone8, mat(0, 1.8, 0, 0.35, 3.6, 0.35), "#e8fbff");
    const r = rng(3);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const from: V3 = [Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0];
      const to: V3 = [Math.cos(a) * (3.4 + r() * 0.4), -1.2, Math.sin(a) * (3.4 + r() * 0.4)];
      const mid: V3 = [(from[0] + to[0]) / 2, 1.0, (from[2] + to[2]) / 2];
      j.seg("#d4f6ff", from, mid, 0.22, G.cyl6);
      j.seg("#d4f6ff", mid, to, 0.22, G.cyl6);
    }
    const jetGeo = j.geometry();
    const jetMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.8, roughness: 0.2, emissive: "#9fe9ff", emissiveIntensity: 0.3 });

    const spark = new THREE.InstancedMesh(G.ico, kit.spark, 16);
    spark.frustumCulled = false;
    spark.visible = false;
    const standbyGeo = new THREE.IcosahedronGeometry(0.2, 1);
    return { tex, boardMat, board, poolMesh, plane, starGeo, jetGeo, jetMat, spark, standbyGeo, rand: rng(9) };
  }, [kit, boards, pools]);
  useEffect(
    () => () => {
      disposeAll([parts.tex, parts.boardMat, parts.board, parts.plane, parts.starGeo, parts.jetGeo, parts.jetMat, parts.standbyGeo]);
      // the instance buffers (the sparks' geometry is the shared G.ico: not disposed)
      disposeAll([parts.poolMesh, parts.spark]);
    },
    [parts],
  );

  const [bx, bz] = POWER_BOX;
  const by = groundY(bx, bz);
  const standbyAt: V3 = [bx + 0.72, by + 2.05, bz + 0.78];

  useFrame(() => {
    const L = live.current;
    if (!L) return;
    const p = L.p;
    // standby: a slow dim red pulse while off, cyan once on
    const pulse = 0.55 + 0.45 * Math.sin(L.time * 2.4);
    kit.standby.color.copy(RED).multiplyScalar(0.35 + 0.65 * pulse).lerp(ON, p);
    kit.halo.color.copy(kit.standby.color).multiplyScalar(night ? 1 : 0.6);
    if (halo.current) halo.current.scale.setScalar((night ? 3.4 : 2.4) * (1 - p * 0.3));
    // sparks while powering up
    const rising = p > prev.current && p < 0.75;
    prev.current = p;
    parts.spark.visible = rising;
    if (rising) {
      const r = parts.rand;
      for (let i = 0; i < 16; i++) {
        const s = r() < 0.5 ? 0 : 0.08 + r() * 0.2;
        parts.spark.setMatrixAt(i, mat(bx + (r() - 0.5) * 2.6, by + 1.6 + r() * 2.2, bz + (r() - 0.3) * 2.0, s, s, s, r() * 6, r() * 6));
      }
      parts.spark.instanceMatrix.needsUpdate = true;
    }
    // boards: CLOSED until the lights come on, then OPEN; faint at night while off
    const open = p > 0.6;
    parts.tex.offset.y = open ? 0 : 0.5;
    parts.boardMat.color.setScalar(open ? 1 : night ? 0.35 : 0.8);
    parts.boardMat.emissiveIntensity = open ? (night ? 0.9 : 0.25) : night ? 0.12 : 0;
    // the star turns and the fountain plays once powered
    if (star.current) star.current.rotation.y += L.dt * L.run * 0.8;
    if (jets.current) {
      const k = L.run;
      jets.current.visible = k > 0.02;
      jets.current.scale.set(1, k * (0.92 + 0.08 * Math.sin(L.time * 7)), 1);
    }
    if (light.current) light.current.intensity = night ? p * 12 : 0;
  });

  const [cx, cz] = CROSSING;
  const [fx, fz] = FOUNTAIN;
  return (
    <>
      <mesh geometry={parts.board} material={parts.boardMat} />
      <primitive object={parts.poolMesh} />
      <primitive object={parts.spark} />
      <mesh geometry={parts.standbyGeo} material={kit.standby} position={standbyAt} />
      <sprite ref={halo} material={kit.halo} position={standbyAt} scale={2.4} />
      <group position={[cx, 0.46 + POLE_H + 3, cz]}>
        <group ref={star}>
          <mesh geometry={parts.starGeo} material={kit.neon} />
        </group>
      </group>
      <mesh ref={jets} geometry={parts.jetGeo} material={parts.jetMat} position={[fx, 0.27 + 4.95, fz]} visible={false} />
      {/* Kept soft: brighter, it washed the whole crossing out to white at night (with bloom). */}
      {!lite && <pointLight ref={light} color="#7ff6ff" position={[cx, 9, cz]} intensity={0} distance={7} decay={1.2} />}
    </>
  );
}
