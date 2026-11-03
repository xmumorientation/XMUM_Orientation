import { describe, expect, it } from "vitest";
import { PerspectiveCamera } from "three";
import { MapControls } from "three-stdlib";
import { bindTouchTwist, type TouchPoint, type PointerSurface } from "../src/components/map3d/touchTwist";

type Kind = "pointerdown" | "pointermove" | "pointerup" | "pointercancel";
class Surface implements PointerSurface {
  listeners = new Map<Kind, Set<(event: TouchPoint) => void>>();
  addEventListener(kind: Kind, listener: (event: TouchPoint) => void) {
    const listeners = this.listeners.get(kind) ?? new Set();
    listeners.add(listener);
    this.listeners.set(kind, listeners);
  }
  removeEventListener(kind: Kind, listener: (event: TouchPoint) => void) { this.listeners.get(kind)?.delete(listener); }
  send(kind: Kind, pointerId: number, clientX: number, clientY: number, pointerType = "touch") {
    for (const listener of this.listeners.get(kind) ?? []) listener({ pointerId, clientX, clientY, pointerType });
  }
}
function setup() {
  const surface = new Surface();
  const document = new Surface();
  const camera = new PerspectiveCamera();
  camera.position.set(0, 100, 100);
  const controls = new MapControls(camera);
  controls.enableDamping = true;
  controls.update();
  const dispose = bindTouchTwist(surface, document, controls);
  const pair = (degrees: number, span = 100) => {
    const angle = degrees * Math.PI / 180;
    document.send("pointermove", 1, -Math.cos(angle) * span, -Math.sin(angle) * span);
    document.send("pointermove", 2, Math.cos(angle) * span, Math.sin(angle) * span);
  };
  surface.send("pointerdown", 1, -100, 0);
  surface.send("pointerdown", 2, 100, 0);
  return { surface, document, camera, controls, dispose, pair };
}
describe("two-finger map twist", () => {
  it("follows a quarter turn without changing zoom, target or tilt", () => {
    const { pair, controls, camera } = setup();
    const distance = controls.getDistance();
    const tilt = controls.getPolarAngle();
    for (let angle = 1; angle <= 90; angle++) pair(angle);
    expect(controls.getAzimuthalAngle()).toBeCloseTo(Math.PI / 2, 5);
    expect(controls.getDistance()).toBeCloseTo(distance, 5);
    expect(controls.getPolarAngle()).toBeCloseTo(tilt, 5);
    expect(controls.target.length()).toBe(0);
    expect(camera.position.x).toBeGreaterThan(90);
  });
  it("does not treat pinching or two-finger translation as a twist", () => {
    const { pair, controls, document } = setup();
    pair(0, 60);
    document.send("pointermove", 1, -40, 0);
    document.send("pointermove", 2, 80, 0);
    expect(controls.getAzimuthalAngle()).toBeCloseTo(0, 5);
  });
  it("crosses the angle boundary smoothly in both directions", () => {
    const { pair, controls } = setup();
    for (let angle = 1; angle <= 200; angle++) pair(angle);
    expect(controls.getAzimuthalAngle()).toBeCloseTo(-160 * Math.PI / 180, 5);
    for (let angle = 199; angle >= 0; angle--) pair(angle);
    expect(controls.getAzimuthalAngle()).toBeCloseTo(0, 5);
  });
  it("stops on cancellation and removes listeners on cleanup", () => {
    const { document, controls, pair, dispose, surface } = setup();
    document.send("pointercancel", 2, 100, 0);
    pair(45);
    expect(controls.getAzimuthalAngle()).toBeCloseTo(0, 5);
    dispose();
    expect([...surface.listeners.values()].every(set => set.size === 0)).toBe(true);
    expect([...document.listeners.values()].every(set => set.size === 0)).toBe(true);
  });
  it("ignores disabled map controls, including tennis play", () => {
    const { pair, controls } = setup();
    controls.enabled = false;
    pair(45);
    expect(controls.getAzimuthalAngle()).toBeCloseTo(0, 5);
  });
  it("rebases on a third finger instead of jumping", () => {
    const { surface, document, controls, pair } = setup();
    surface.send("pointerdown", 3, 0, 100);
    pair(45);
    expect(controls.getAzimuthalAngle()).toBeCloseTo(0, 5);
    document.send("pointerup", 3, 0, 100);
    for (let angle = 46; angle <= 60; angle++) pair(angle);
    expect(controls.getAzimuthalAngle()).toBeCloseTo(15 * Math.PI / 180, 5);
  });
});
