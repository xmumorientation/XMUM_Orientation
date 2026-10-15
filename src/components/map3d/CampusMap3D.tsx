"use client";

import { Html, MapControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { MapControls as MapControlsImpl } from "three-stdlib";

import { Atmosphere, Effects, MODES, type Mode } from "./atmosphere";
import { B1Building, Blocks, Bridge, Dome, Flags, Grandstand, Letters, Statue } from "./buildings";
import { LABELS } from "./geo";
import { Ground, Slab } from "./ground";
import { SportsCourts, TrackFixtures } from "./sports";
import { Lamps, Vegetation } from "./vegetation";
import { Duck, Lakes } from "./water";

// DRAFT (map-3d-draft branch, not for main): a 3D take on the Figma campus
// map, to see how it looks. No stations, groups or lightbulbs yet.

type Vec3 = [number, number, number];
const START: Vec3 = [118, 104, 118];
// Phones look at the buildings and lakes rather than the middle of the slab.
const TARGET_MOBILE: Vec3 = [-14, 0, -10];
const START_MOBILE: Vec3 = [TARGET_MOBILE[0] + 190, 230, TARGET_MOBILE[2] + 190];

type View = { mobile: boolean; pos: Vec3; target: Vec3; intro: boolean };

/** Draft-only: ?cam=x,y,z,tx,ty,tz sets the start view, ?mode=day|sunset|night the look (for screenshots). */
function readView(): { view: View; mode: Mode | null } {
  const q = new URLSearchParams(window.location.search);
  const mobile = window.matchMedia("(max-width: 768px)").matches;
  const v = q.get("cam")?.split(",").map(Number);
  const cam = v && v.length === 6 && !v.some(Number.isNaN) ? v : null;
  const m = q.get("mode");
  return {
    view: {
      mobile,
      pos: cam ? [cam[0], cam[1], cam[2]] : mobile ? START_MOBILE : START,
      target: cam ? [cam[3], cam[4], cam[5]] : mobile ? TARGET_MOBILE : [0, 0, 0],
      intro: !cam && q.get("intro") !== "0",
    },
    mode: m === "day" || m === "sunset" || m === "night" ? m : null,
  };
}

/** Swoop in from high and to the side, then hand over to the controls. */
function Intro({ view }: { view: View }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.Camera; controls: MapControlsImpl | null };
  const state = useRef<{ t: number; done: boolean; from?: THREE.Spherical; to?: THREE.Spherical }>({
    t: 0,
    done: !view.intro,
  });
  useEffect(() => {
    if (!controls) return;
    controls.target.set(...view.target);
    camera.position.set(...view.pos);
    controls.update();
    controls.saveState();
    if (state.current.done) return;
    const to = new THREE.Spherical().setFromVector3(
      new THREE.Vector3(...view.pos).sub(new THREE.Vector3(...view.target)),
    );
    const from = to.clone();
    from.radius *= 1.9;
    from.phi *= 0.45;
    from.theta -= 1.1;
    state.current.from = from;
    state.current.to = to;
    const stop = () => (state.current.done = true);
    controls.addEventListener("start", stop);
    return () => controls.removeEventListener("start", stop);
  }, [controls, camera, view]);
  useFrame((_, dt) => {
    const s = state.current;
    if (s.done || !s.from || !s.to || !controls) return;
    s.t = Math.min(1, s.t + dt / 2.6);
    const k = 1 - Math.pow(1 - s.t, 3);
    const sph = new THREE.Spherical(
      THREE.MathUtils.lerp(s.from.radius, s.to.radius, k),
      THREE.MathUtils.lerp(s.from.phi, s.to.phi, k),
      THREE.MathUtils.lerp(s.from.theta, s.to.theta, k),
    );
    camera.position.setFromSpherical(sph).add(controls.target);
    controls.update();
    if (s.t >= 1) s.done = true;
  });
  return null;
}

/** Minor labels fade in within this distance of the camera. */
const MINOR_LABEL_DISTANCE = 95;

function Label({ name, pos, y, minor }: (typeof LABELS)[number]) {
  const ref = useRef<HTMLDivElement>(null);
  const at = useMemo(() => new THREE.Vector3(pos[0], y, pos[1]), [pos, y]);
  useFrame(({ camera }) => {
    if (!minor || !ref.current) return;
    const opacity = camera.position.distanceTo(at) < MINOR_LABEL_DISTANCE ? "1" : "0";
    if (ref.current.style.opacity !== opacity) ref.current.style.opacity = opacity;
  });
  return (
    <Html position={[pos[0], y, pos[1]]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <div
        ref={ref}
        style={{
          whiteSpace: "nowrap",
          fontFamily: "system-ui, sans-serif",
          fontSize: minor ? 10 : 11,
          fontWeight: 700,
          letterSpacing: 0.2,
          color: "#fff",
          background: "rgba(20,18,30,0.72)",
          border: "1px solid rgba(255,255,255,0.22)",
          borderRadius: 999,
          padding: "3px 8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          opacity: minor ? 0 : 1,
          transition: "opacity 0.25s",
        }}
      >
        {name}
      </div>
    </Html>
  );
}

function Labels() {
  return (
    <>
      {LABELS.map((l) => (
        <Label key={l.name} {...l} />
      ))}
    </>
  );
}

const pill = (active: boolean): React.CSSProperties => ({
  pointerEvents: "auto",
  background: active ? "rgba(255,255,255,0.92)" : "transparent",
  color: active ? "#1b1b24" : "#fff",
  border: "none",
  borderRadius: 999,
  padding: "7px 13px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
});

const glass: React.CSSProperties = {
  background: "rgba(20,18,30,0.45)",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 999,
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
};

export default function CampusMap3D() {
  const controls = useRef<MapControlsImpl>(null);
  const [view, setView] = useState<View | null>(null);
  const [mode, setMode] = useState<Mode>("sunset");
  const [labels, setLabels] = useState(true);
  useEffect(() => {
    const r = readView();
    setView(r.view);
    if (r.mode) setMode(r.mode);
  }, []);
  const look = MODES[mode];
  const mobile = view?.mobile ?? false;

  return (
    <main style={{ position: "fixed", inset: 0, background: look.skyTop }}>
      {view && (
        <Canvas
          shadows
          dpr={mobile ? [1, 1.5] : [1, 1.75]}
          camera={{ fov: 30, near: 1, far: 1600, position: view.pos }}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.NeutralToneMapping;
          }}
        >
          <Atmosphere look={look} mode={mode} shadows={!mobile} />
          <Slab />
          <Ground />
          <Lakes />
          <Duck />
          <Blocks glow={look.windows} />
          <B1Building glow={look.windows} />
          <Grandstand />
          <TrackFixtures glow={look.lamps} />
          <SportsCourts glow={look.lamps} />
          <Statue />
          <Flags />
          <Dome glow={look.windows} />
          <Bridge />
          <Letters />
          <Vegetation shadows={!mobile} />
          <Lamps glow={look.lamps} />
          {labels && <Labels />}
          <MapControls
            ref={controls}
            makeDefault
            enableDamping
            minDistance={20}
            maxDistance={420}
            maxPolarAngle={1.3}
            screenSpacePanning={false}
          />
          <Intro view={view} />
          {!mobile && <Effects look={look} />}
        </Canvas>
      )}

      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          right: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          pointerEvents: "none",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
          zIndex: 20,
          textShadow: "0 1px 6px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>XMUM campus · 3D draft</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
            {mobile ? "1 finger: move · 2 fingers: rotate and zoom" : "Drag: move · Right-drag: rotate · Scroll: zoom"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => controls.current?.reset()}
          style={{ ...pill(false), ...glass, flexShrink: 0, padding: "8px 14px" }}
        >
          Reset view
        </button>
      </div>

      <div
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: "calc(20px + env(safe-area-inset-bottom))",
          display: "flex",
          justifyContent: "center",
          gap: 8,
          flexWrap: "wrap",
          pointerEvents: "none",
          fontFamily: "system-ui, sans-serif",
          zIndex: 20,
        }}
      >
        <div style={{ ...glass, display: "flex", padding: 4, gap: 2 }}>
          {(Object.keys(MODES) as Mode[]).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} style={pill(mode === m)}>
              {MODES[m].label}
            </button>
          ))}
        </div>
        <div style={{ ...glass, display: "flex", padding: 4 }}>
          <button type="button" onClick={() => setLabels((v) => !v)} style={pill(labels)}>
            Labels
          </button>
        </div>
      </div>
    </main>
  );
}
