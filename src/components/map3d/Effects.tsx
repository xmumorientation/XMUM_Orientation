"use client";

import { Bloom, EffectComposer, N8AO, TiltShift2, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import type { ModeLook } from "./atmosphere";

/**
 * Ambient occlusion, glow, a light tilt-shift (miniature look) and tone mapping. `tiltShift` false leaves the
 * miniature blur out (the tennis game's broadcast view, which should look life size).
 */
export default function Effects({ look, tiltShift = true }: { look: ModeLook; tiltShift?: boolean }) {
  return (
    <EffectComposer multisampling={4}>
      <N8AO aoRadius={2.5} intensity={2.2} distanceFalloff={1.5} halfRes quality="medium" />
      <Bloom mipmapBlur intensity={look.bloom[0]} luminanceThreshold={look.bloom[1]} luminanceSmoothing={0.2} />
      {tiltShift && <TiltShift2 blur={0.09} taper={0.5} start={[0, 0.56]} end={[1, 0.56]} samples={8} />}
      <Vignette offset={0.3} darkness={0.45} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  );
}
