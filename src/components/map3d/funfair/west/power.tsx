"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { G, mat, rng, smooth, type V3 } from "../central/kit";
import { groundY } from "./ground";
import type { WestKit } from "./kit";
import { POWER_BOX, WHEEL } from "./layout";
import { disposeAll, type Board, type Live, type Pool } from "./parts";

// DRAFT: the West zone's power look that isn't baked: the power box's red
// standby light and its sparks, the CLOSED/OPEN boards, the light pools, and
// the zone's one point light (full mode, at night, under the Vortexa Eye).

const _c = new THREE.Color();
const RED = new THREE.Color("#ff2a2a");
const ON = new THREE.Color("#ff6cd0");

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
  half(0, "#f4eef8", "#c8202e", "CLOSED");
  half(128, "#2a0f3a", "#ff6cd0", "OPEN");
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

export function PowerFx({ kit, live, night, lite, boards, pools }: { kit: WestKit; live: RefObject<Live>; night: boolean; lite: boolean; boards: Board[]; pools: Pool[] }) {
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

    const spark = new THREE.InstancedMesh(G.ico, kit.spark, 18);
    spark.frustumCulled = false;
    spark.visible = false;
    const standbyGeo = new THREE.IcosahedronGeometry(0.2, 1);
    return { tex, boardMat, board, poolMesh, plane, spark, standbyGeo, rand: rng(11) };
  }, [kit, boards, pools]);
  useEffect(
    () => () => {
      disposeAll([parts.tex, parts.boardMat, parts.board, parts.plane, parts.standbyGeo]);
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
    // standby: a slow dim red pulse while off, the zone's pink once on
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
      for (let i = 0; i < 18; i++) {
        const s = r() < 0.5 ? 0 : 0.08 + r() * 0.2;
        parts.spark.setMatrixAt(i, mat(bx + (r() - 0.5) * 2.8, by + 1.6 + r() * 2.4, bz + (r() - 0.3) * 2.2, s, s, s, r() * 6, r() * 6));
      }
      parts.spark.instanceMatrix.needsUpdate = true;
    }
    // boards: CLOSED until the lights come on, then OPEN; faint at night while off
    const open = p > 0.6;
    parts.tex.offset.y = open ? 0 : 0.5;
    parts.boardMat.color.setScalar(open ? 1 : night ? 0.35 : 0.85);
    parts.boardMat.emissiveIntensity = open ? (night ? 0.9 : 0.25) : night ? 0.12 : 0;
    // light pools follow the bulbs (they come on through the middle of the power-up): soft by day, strong at night
    const glow = smooth(0.3, 0.85, p);
    kit.pool.opacity = glow * (night ? 0.55 : 0.1);
    parts.poolMesh.visible = glow > 0.01;
    if (light.current) light.current.intensity = night ? glow * 16 : 0;
  });

  return (
    <>
      <mesh geometry={parts.board} material={parts.boardMat} />
      <primitive object={parts.poolMesh} />
      <primitive object={parts.spark} />
      <mesh geometry={parts.standbyGeo} material={kit.standby} position={standbyAt} />
      <sprite ref={halo} material={kit.halo} position={standbyAt} scale={2.4} />
      {!lite && <pointLight ref={light} color="#ff5fc8" position={[WHEEL[0], 9, WHEEL[1]]} intensity={0} distance={8} decay={1.2} />}
    </>
  );
}
