import { Vector3 } from "three";
import type { MapControls } from "three-stdlib";

export type TouchPoint = Pick<PointerEvent, "pointerId" | "pointerType" | "clientX" | "clientY">;
type Kind = "pointerdown" | "pointermove" | "pointerup" | "pointercancel";
export interface PointerSurface {
  addEventListener(kind: Kind, listener: (event: TouchPoint) => void): void;
  removeEventListener(kind: Kind, listener: (event: TouchPoint) => void): void;
}

/** Adds finger-angle rotation without consuming the controls' existing pinch, drag or tilt events. */
export function bindTouchTwist(surface: PointerSurface, document: PointerSurface, controls: MapControls) {
  const touches = new Map<number, { x: number; y: number }>();
  const offset = new Vector3();
  let previous: number | null = null;
  const enabled = () => controls.enabled && controls.enableRotate;
  const angle = () => {
    if (touches.size !== 2) return null;
    const [a, b] = [...touches.values()];
    if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) < 24) return null;
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  const reset = () => { touches.clear(); previous = null; };
  const down = (event: TouchPoint) => {
    if (event.pointerType !== "touch") return;
    if (!enabled()) return reset();
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    previous = angle();
  };
  const move = (event: TouchPoint) => {
    if (event.pointerType !== "touch" || !touches.has(event.pointerId)) return;
    if (!enabled()) return reset();
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const next = angle();
    if (previous !== null && next !== null) {
      // The shortest signed angle avoids a full turn when atan2 crosses -PI / PI.
      const delta = Math.atan2(Math.sin(next - previous), Math.cos(next - previous));
      if (Math.abs(delta) > 0.00001) {
        // Rotate the actual camera offset so native damping/drag deltas remain intact.
        offset.copy(controls.object.position).sub(controls.target).applyAxisAngle(controls.object.up, delta);
        controls.object.position.copy(controls.target).add(offset);
        controls.update();
      }
    }
    previous = next;
  };
  const up = (event: TouchPoint) => {
    if (event.pointerType !== "touch") return;
    touches.delete(event.pointerId);
    previous = angle();
  };
  surface.addEventListener("pointerdown", down);
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up);
  return () => {
    surface.removeEventListener("pointerdown", down);
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", up);
    reset();
  };
}
