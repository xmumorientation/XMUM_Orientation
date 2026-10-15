// Device checks for the 3D map: whether it can run at all, and whether to
// use the lighter scene. Browser only.

let webglCache: boolean | null = null;

/** True when a WebGL context can be created (the 2D map is the fallback otherwise). */
export function canUseWebGL(): boolean {
  if (webglCache !== null) return webglCache;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    webglCache = !!gl;
    (gl?.getExtension("WEBGL_lose_context") as { loseContext(): void } | null)?.loseContext();
  } catch {
    webglCache = false;
  }
  return webglCache;
}

/** Phones and low-power devices get lite mode: no post-processing, fewer trees, lower resolution. */
export function prefersLite(): boolean {
  if (window.matchMedia("(max-width: 768px)").matches) return true;
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
}
