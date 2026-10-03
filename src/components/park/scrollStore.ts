// Render-free scroll state shared between GSAP (which writes the raw scroll
// progress) and the R3F frame loop (which eases toward it). Deliberately a
// plain mutable object — not React state — so scrolling never triggers a
// re-render; every frame just reads the latest numbers.
export const scroll = {
  /** Raw 0..1 progress reported by ScrollTrigger. */
  target: 0,
  /** Eased 0..1 value the 3D scene actually follows (cinematic lag). */
  current: 0,
};

export function resetScroll() {
  scroll.target = 0;
  scroll.current = 0;
}
