import * as THREE from "three";

import { PAINT } from "./build";
import { SLATS_PER_BAY } from "./layout";

// DRAFT: the LakeFront Café's materials. The shell's skin is one double-sided surface: outside, thin red slats over
// the white membrane (anti-aliased, so far away they blend to the photos' pinkish red instead of shimmering);
// inside, the white membrane the audience looks up at.

/** Share of each slat period that is red. */
const DUTY = 0.64;

function shellMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.55, metalness: 0.04, side: THREE.DoubleSide });
  const uniforms = { uSlat: { value: new THREE.Color(PAINT.red) }, uSkin: { value: new THREE.Color("#f3f0ea") } };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aShell;\nvarying vec2 vShell;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvShell = aShell;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uSlat, uSkin;\nvarying vec2 vShell;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float slatX = vShell.y * ${(6 * SLATS_PER_BAY).toFixed(1)};
        float slatW = fwidth(slatX);
        float slat = 1.0 - smoothstep(${(DUTY / 2).toFixed(3)} - slatW, ${(DUTY / 2).toFixed(3)} + slatW, abs(fract(slatX) - 0.5));
        slat = mix(slat, ${DUTY.toFixed(3)}, smoothstep(0.3, 0.8, slatW));
        diffuseColor.rgb = gl_FrontFacing ? mix(uSkin, uSlat, slat) : uSkin;`,
      );
  };
  m.customProgramCacheKey = () => "lakefront-shell";
  return m;
}

export function makeKit() {
  return {
    venue: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 }),
    steel: new THREE.MeshStandardMaterial({ color: PAINT.red, roughness: 0.36, metalness: 0.25 }),
    shell: shellMaterial(),
    // like the lake (water.tsx)
    water: new THREE.MeshStandardMaterial({
      color: "#8fd3f2",
      transparent: true,
      opacity: 0.62,
      roughness: 0.16,
      metalness: 0.1,
      envMapIntensity: 1.4,
    }),
  };
}
export type Kit = ReturnType<typeof makeKit>;

export function disposeKit(k: Kit) {
  for (const m of Object.values(k)) m.dispose();
}
