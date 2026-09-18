"use client";

import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";

import { NEON } from "./palette";
import { NeonEnvironment } from "./NeonEnvironment";
import { FerrisWheel } from "./FerrisWheel";
import { CameraController } from "./CameraController";

type Props = {
  mobile?: boolean;
  reduced?: boolean;
};

/**
 * The WebGL layer. Fixed, full-viewport, behind the HTML typography overlay.
 * Bloom (the neon glow) is desktop-only and skipped for reduced motion / mobile
 * to keep the prototype smooth on modest hardware.
 */
export default function CinematicScene({ mobile = false, reduced = false }: Props) {
  const useBloom = !mobile && !reduced;

  return (
    <Canvas
      dpr={mobile ? [1, 1.5] : [1, 2]}
      gl={{
        antialias: !mobile,
        powerPreference: "high-performance",
        alpha: false,
      }}
      camera={{ fov: 55, near: 0.1, far: 260, position: [0, 3.5, 34] }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={[NEON.deep]} />
      <fog attach="fog" args={[NEON.deep, 16, mobile ? 80 : 130]} />

      <NeonEnvironment mobile={mobile} reduced={reduced} />
      <FerrisWheel mobile={mobile} reduced={reduced} />
      <CameraController enabled={!reduced} />

      {useBloom && (
        <EffectComposer>
          <Bloom
            intensity={0.9}
            luminanceThreshold={0.15}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
          <Vignette eskil={false} offset={0.25} darkness={0.9} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
