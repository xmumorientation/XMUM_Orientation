import * as THREE from "three";

import { makeRig, posePlayer, type Pose } from "./player";
import type { V3 } from "./rally";

// DRAFT: the tennis game's hit effects (docs/ROADMAP.md, item 9, batch T1b): the ball's trail, the racket's blur,
// a ring where the ball lands (red when out) or meets the net, a flash at each hit, and the ring that shows the
// player where to meet the ball. Each is one mesh and one material, moved every frame with no React. All in metres
// in the court's frame, and each works out its look from the game's time, so a slow phone draws the same moment.

/** A soft white dot: the flash, and (tinted black) the round shadows. */
export function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Effects draw after the courts (their surface is renderOrder 1) and the shadows. */
const ORDER = 3;

/** A ribbon of quads between two rows of points, with a colour and an alpha at each point. */
class Strip {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;

  constructor(readonly n: number) {
    this.pos = new Float32Array(n * 6);
    this.col = new Float32Array(n * 8);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    g.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = ORDER;
    this.mesh.visible = false;
  }

  set(i: number, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Color, alpha: number) {
    this.pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    this.col.set([c.r, c.g, c.b, alpha, c.r, c.g, c.b, alpha], i * 8);
  }

  /** Draws the first `count` points' quads. */
  show(count: number) {
    const g = this.mesh.geometry;
    g.setDrawRange(0, Math.max(0, count - 1) * 6);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    this.mesh.visible = count > 1;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/** The trail: the ball's last TRAIL_S seconds, as a ribbon facing the camera, fading to its tail. */
const TRAIL_N = 12;
const TRAIL_S = 0.16;
/** Slower than this (m/s) the trail fades away. */
const TRAIL_SPEED = 9;

export class Trail {
  private readonly strip = new Strip(TRAIL_N);
  private readonly pts = Array.from({ length: TRAIL_N }, () => new THREE.Vector3());
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  readonly mesh = this.strip.mesh;

  /**
   * `ballAt`: the ball at a time; `since`: when it left the racket (the trail starts there); `eye`: the camera, in
   * the court's frame.
   */
  update(ballAt: (t: number) => V3 | null, t: number, since: number, eye: THREE.Vector3, color: THREE.Color, width: number) {
    let n = 0;
    for (let i = 0; i < TRAIL_N; i++) {
      const ti = t - (i / (TRAIL_N - 1)) * TRAIL_S;
      const p = ti >= since ? ballAt(ti) : null;
      if (!p) break;
      this.pts[i].set(...p);
      n++;
    }
    const speed = n > 1 ? this.pts[0].distanceTo(this.pts[1]) / (TRAIL_S / (TRAIL_N - 1)) : 0;
    const fade = Math.min(1, Math.max(0, (speed - TRAIL_SPEED) / 6));
    if (n < 2 || fade <= 0) {
      this.strip.show(0);
      return;
    }
    for (let i = 0; i < n; i++) {
      const p = this.pts[i];
      const q = this.pts[Math.min(n - 1, i + 1)];
      const o = this.pts[Math.max(0, i - 1)];
      // across the trail, square to its line and to the camera
      this.side.subVectors(o, q).cross(this.a.subVectors(eye, p)).normalize();
      const k = 1 - i / (TRAIL_N - 1);
      this.side.multiplyScalar(width * (0.25 + 0.75 * k));
      this.strip.set(i, this.a.copy(p).add(this.side), this.b.copy(p).sub(this.side), color, 0.6 * k ** 1.4 * fade);
    }
    this.strip.show(n);
  }

  dispose() {
    this.strip.dispose();
  }
}

/** The racket's blur: the head's sweep over the last SMEAR_S seconds, between its tip and throat, round a contact. */
const SMEAR_N = 8;
const SMEAR_S = 0.12;
const WHITE = new THREE.Color("#ffffff");

export class Smear {
  private readonly strip = new Strip(SMEAR_N);
  /** A rig at the origin, unscaled: its points are in the player's own frame, which the blur's mesh joins. */
  private readonly rig = makeRig();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  readonly mesh = this.strip.mesh;

  constructor() {
    this.rig.root.scale.setScalar(1);
  }

  /** `poseAt`: the swing's pose at a time; `rel`: now, from its contact; `since`: when the swing's pose began. */
  update(poseAt: (t: number) => Pose, t: number, rel: number | null, since: number) {
    if (rel === null || rel < -0.2 || rel > 0.18) {
      this.strip.show(0);
      return;
    }
    // strongest through the contact
    const fade = 1 - Math.min(1, Math.abs(rel) / 0.2);
    let n = 0;
    for (let i = 0; i < SMEAR_N; i++) {
      const ti = t - (i / (SMEAR_N - 1)) * SMEAR_S;
      if (ti < since) break;
      posePlayer(this.rig, poseAt(ti));
      this.rig.root.updateMatrixWorld(true);
      this.rig.tip.getWorldPosition(this.a);
      this.rig.throat.getWorldPosition(this.b);
      this.strip.set(i, this.a, this.b, WHITE, 0.55 * (1 - i / (SMEAR_N - 1)) * fade);
      n++;
    }
    this.strip.show(n);
  }

  dispose() {
    this.strip.dispose();
  }
}

/** A ring that grows and fades: where the ball lands (flat), or meets the net (upright, facing along the court). */
export class Pulse {
  readonly mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private t0 = -Infinity;
  private hold = 0.5;
  private size = 1;

  constructor(upright: boolean) {
    const g = new THREE.RingGeometry(0.8, 1, 40);
    if (upright) g.rotateY(Math.PI / 2);
    else g.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.renderOrder = ORDER;
    this.mesh.visible = false;
  }

  fire(t: number, p: V3, color: string, size: number, hold: number) {
    this.t0 = t;
    this.size = size;
    this.hold = hold;
    this.mesh.position.set(...p);
    this.mesh.material.color.set(color);
  }

  /** Whether it still shows at time t. */
  update(t: number) {
    const u = (t - this.t0) / this.hold;
    const on = u >= 0 && u < 1;
    this.mesh.visible = on;
    if (on) {
      this.mesh.scale.setScalar(this.size * (0.3 + 0.7 * (1 - (1 - u) ** 3)));
      this.mesh.material.opacity = 0.9 * (1 - u) ** 1.3;
    }
    return on;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/** A flash where the racket meets the ball, bigger for a clean hit. */
const FLASH_S = 0.2;

export class Flash {
  readonly sprite: THREE.Sprite;
  private t0 = -Infinity;
  private size = 1;

  constructor(map: THREE.Texture) {
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map, color: "#fff6d8", blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    );
    this.sprite.renderOrder = ORDER;
    this.sprite.visible = false;
  }

  fire(t: number, p: V3, size: number) {
    this.t0 = t;
    this.size = size;
    this.sprite.position.set(...p);
  }

  update(t: number) {
    const u = (t - this.t0) / FLASH_S;
    const on = u >= 0 && u < 1;
    this.sprite.visible = on;
    if (on) {
      this.sprite.scale.setScalar(this.size * (0.5 + u));
      this.sprite.material.opacity = (1 - u) ** 2;
    }
    return on;
  }

  dispose() {
    this.sprite.material.dispose();
  }
}

/**
 * Where the player should meet the ball: a ring on the ground under it, in their colour once they can reach it
 * from where they stand (white before), and pulsing while a tap would meet it.
 */
export class Marker {
  readonly mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;

  constructor() {
    const g = new THREE.RingGeometry(0.62, 0.8, 40).rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.renderOrder = ORDER;
    this.mesh.visible = false;
  }

  update(m: { x: number; z: number; ok: boolean; now: boolean } | null, t: number, color: string) {
    this.mesh.visible = m !== null;
    if (!m) return;
    this.mesh.position.set(m.x, 0.14, m.z);
    this.mesh.material.color.set(m.ok ? color : "#ffffff");
    this.mesh.material.opacity = m.now ? 0.95 : m.ok ? 0.7 : 0.4;
    this.mesh.scale.setScalar(m.now ? 1 + 0.12 * Math.sin(t * 18) : 1);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
