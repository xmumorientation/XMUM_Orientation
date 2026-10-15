"use client";

import { Html, Hud, MapControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import * as THREE from "three";
import type { MapControls as MapControlsImpl } from "three-stdlib";

import { Atmosphere, Effects, MODES, type Mode } from "./atmosphere";
import { B1Building, Blocks, Bridge, Dome, Flag, Grandstand, Letters, Statue } from "./buildings";
import { LABELS } from "./geo";
import { Ground, Slab } from "./ground";
import { SportsCourts, TrackFixtures } from "./sports";
import { Lamps, Vegetation } from "./vegetation";
import { Duck, Lakes } from "./water";
import { prefersLite } from "./webgl";

// The 3D campus, sized to its parent (a card or fullscreen). No page
// chrome: callers add their own controls around it, and 3D overlays as
// children (in the scene) or as `overlay` (drawn on top, after the effects).

export type Vec3 = [number, number, number];
export type CameraView = { position: Vec3; target: Vec3 };

const START: CameraView = { position: [118, 104, 118], target: [0, 0, 0] };
// Narrow views look at the buildings and lakes rather than the middle of the slab.
const TARGET_NARROW: Vec3 = [-14, 0, -10];
const START_NARROW: CameraView = {
  position: [TARGET_NARROW[0] + 190, 230, TARGET_NARROW[2] + 190],
  target: TARGET_NARROW,
};
/** Containers this wide or narrower start from the closer, narrow view. */
const NARROW_PX = 768;

type Start = CameraView & { intro: boolean };

/** Swoop in from high and to the side, then hand over to the controls. */
function Intro({ start }: { start: Start }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.Camera; controls: MapControlsImpl | null };
  const state = useRef<{ t: number; done: boolean; from?: THREE.Spherical; to?: THREE.Spherical }>({
    t: 0,
    done: !start.intro,
  });
  useEffect(() => {
    if (!controls) return;
    controls.target.set(...start.target);
    camera.position.set(...start.position);
    controls.update();
    controls.saveState();
    if (state.current.done) return;
    const to = new THREE.Spherical().setFromVector3(
      new THREE.Vector3(...start.position).sub(new THREE.Vector3(...start.target)),
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
  }, [controls, camera, start]);
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

const Labels = memo(function Labels() {
  return (
    <>
      {LABELS.map((l) => (
        <Label key={l.name} {...l} />
      ))}
    </>
  );
});

/** Everything that never changes after mount, so a caller's re-render (new markers) skips it. */
const Campus = memo(function Campus({ mode, lite }: { mode: Mode; lite: boolean }) {
  const look = MODES[mode];
  return (
    <>
      <Atmosphere look={look} mode={mode} lite={lite} />
      <Slab />
      <Ground lite={lite} />
      <Lakes />
      <Duck />
      <Blocks glow={look.windows} />
      <B1Building glow={look.windows} />
      <Grandstand />
      <TrackFixtures glow={look.lamps} />
      <SportsCourts glow={look.lamps} />
      <Statue />
      <Flag />
      <Dome glow={look.windows} />
      <Bridge />
      <Letters />
      <Vegetation lite={lite} />
      <Lamps glow={look.lamps} />
    </>
  );
});

/** A still scene (a card on a page) leaves touches to the page so it scrolls; the controls take them otherwise. */
function TouchPolicy({ interactive }: { interactive: boolean }) {
  const controls = useThree((s) => s.controls) as MapControlsImpl | null;
  useEffect(() => {
    if (!controls) return;
    controls.enabled = interactive;
    const el = controls.domElement as HTMLElement | undefined;
    if (el) el.style.touchAction = interactive ? "none" : "";
  }, [controls, interactive]);
  return null;
}

/** Required by the OpenStreetMap licence wherever the map is shown. */
function Attribution() {
  return (
    <div
      style={{
        position: "absolute",
        right: 8,
        bottom: 4,
        fontFamily: "system-ui, sans-serif",
        fontSize: 10,
        color: "rgba(255,255,255,0.8)",
        textShadow: "0 1px 3px rgba(0,0,0,0.5)",
        zIndex: 20,
      }}
    >
      Map data ©{" "}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
        OpenStreetMap contributors
      </a>
    </div>
  );
}

export type CampusSceneProps = {
  mode?: Mode;
  /** Phone-friendly scene. Defaults to `prefersLite()` (narrow viewport or low-power device). */
  lite?: boolean;
  /** Start view, read once on mount. Defaults by container width. */
  camera?: CameraView;
  /** Swoop in at the start (default true). */
  intro?: boolean;
  /** Place-name labels (default true). */
  labels?: boolean;
  controlsRef?: Ref<MapControlsImpl>;
  /** Camera controls on (default true). Off, the view stays still and touches scroll the page. */
  interactive?: boolean;
  /** Rendered inside the Canvas, in the scene (depth-tested, post-processed): ground overlays, hit areas. */
  children?: ReactNode;
  /**
   * Rendered inside the Canvas on top of the finished frame (after the effects, so never blurred), with its
   * own scene: markers and pins. It has no lights unless it adds some. Its objects get pointer events first.
   */
  overlay?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export default function CampusScene({
  mode = "sunset",
  lite,
  camera,
  intro = true,
  labels = true,
  controlsRef,
  interactive = true,
  children,
  overlay,
  className,
  style,
}: CampusSceneProps) {
  const box = useRef<HTMLDivElement>(null);
  const initial = useRef({ camera, intro });
  const [start, setStart] = useState<Start | null>(null);
  const [autoLite, setAutoLite] = useState<boolean | null>(null);
  useEffect(() => {
    const { camera: cam, intro: swoop } = initial.current;
    const narrow = (box.current?.clientWidth ?? window.innerWidth) <= NARROW_PX;
    setStart({ ...(cam ?? (narrow ? START_NARROW : START)), intro: swoop });
    setAutoLite(prefersLite());
  }, []);
  const isLite = lite ?? autoLite ?? false;
  const ready = start !== null && autoLite !== null;
  const look = MODES[mode];

  return (
    <div
      ref={box}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: look.skyTop,
        ...style,
      }}
    >
      {ready && (
        <Canvas
          shadows
          dpr={isLite ? [1, 1.5] : [1, 1.75]}
          camera={{ fov: 30, near: 1, far: 1600, position: start.position }}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.NeutralToneMapping;
          }}
        >
          <Campus mode={mode} lite={isLite} />
          {labels && <Labels />}
          {children}
          <MapControls
            ref={controlsRef}
            makeDefault
            enableDamping
            enabled={interactive}
            minDistance={6}
            maxDistance={420}
            maxPolarAngle={1.3}
            screenSpacePanning={false}
          />
          <TouchPolicy interactive={interactive} />
          <Intro start={start} />
          {!isLite && <Effects look={look} />}
          {/* After the effects' pass (priority 1); in lite mode the Hud draws the scene itself first. */}
          {overlay && <Hud renderPriority={isLite ? 1 : 2}>{overlay}</Hud>}
        </Canvas>
      )}
      <Attribution />
    </div>
  );
}
