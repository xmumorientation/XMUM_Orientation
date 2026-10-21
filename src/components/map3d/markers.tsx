"use client";

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { MapControls as MapControlsImpl } from "three-stdlib";

import { KEY_COLORS } from "@/components/freshie/items/KeyEmblem";
import { DEFAULT_ZONE_KEYS, FUNFAIR_ZONES, type FunfairPower, type FunfairZone } from "@/lib/funfair";
import { PROJECTOR_CODE_NAMES, type ProjectorLocation } from "@/lib/types";

import type { Vec3 } from "./CampusScene";
import { EXTENT, type Placed } from "./geo";
import { RIDE_TAGS, ZONE_CENTERS } from "./funfair/labels";
import { localToWorld } from "./places";
import { plateauSurface } from "./plateau";

// DRAFT (map-3d-draft branch): map markers for the 3D campus. Markers are
// sprites drawn from small canvases, a fixed size on screen like the 2D
// map's dots; textures with the same look are shared. Ground marks (accuracy
// circles, the open building's outline) are painted on one canvas laid over
// the ground.

/** Texture pixels per CSS pixel, so markers stay sharp on phones. */
const RES = 2;
/** A press that moves further than this (CSS px) is a drag, not a tap. */
const TAP_SLOP = 8;
/**
 * A finger moves more: phones still report a tap after 10–15 px. With the mouse's 8 px, such taps did nothing
 * (and only nudged the map), so a badge tap on a phone seemed not to centre on its building.
 */
const TOUCH_TAP_SLOP = 16;

/** Whether a click in the scene was a tap, not the end of a drag. */
export function isTap(e: ThreeEvent<MouseEvent>): boolean {
  // Older Safari sends the click as a plain MouseEvent, without pointerType.
  const type = (e.nativeEvent as Partial<PointerEvent>).pointerType;
  const touch = type ? type === "touch" : window.matchMedia("(pointer: coarse)").matches;
  return e.delta <= (touch ? TOUCH_TAP_SLOP : TAP_SLOP);
}

/** World size of one CSS pixel for a sprite drawn at a fixed size on screen (sizeAttenuation off). */
export function usePxScale(): number {
  const height = useThree((s) => s.size.height);
  const fov = useThree((s) => (s.camera as THREE.PerspectiveCamera).fov);
  return (2 * Math.tan((fov * Math.PI) / 360)) / Math.max(1, height);
}

const textures = new Map<string, THREE.CanvasTexture>();

/** One texture per look (`key`), shared by every marker that looks the same. */
function cachedTexture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const hit = textures.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * RES);
  canvas.height = Math.ceil(h * RES);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(RES, RES);
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  // Looks change with status, selection and age; drop the oldest past a few hundred.
  if (textures.size > 300) {
    const [oldKey, old] = textures.entries().next().value!;
    textures.delete(oldKey);
    old.dispose();
  }
  textures.set(key, tex);
  return tex;
}

/** A texture and the point on it (CSS px from its top left) that matters: a dot's centre, a pin's tip. */
export type MarkerArt = { tex: THREE.Texture; w: number; h: number; x: number; y: number; r: number };

const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string) {
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#ffffff";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = color;
  ctx.stroke();
}

/** Status shown by shape as well as colour (as on the 2D map): solid, ring (in progress) or crossed (closed). */
function statusMark(ctx: CanvasRenderingContext2D, status: string, x: number, y: number, r: number) {
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  if (status === "in_progress") {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
  } else if (status === "closed") {
    const d = r * 0.5;
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - d, y - d);
    ctx.lineTo(x + d, y + d);
    ctx.moveTo(x - d, y + d);
    ctx.lineTo(x + d, y - d);
    ctx.stroke();
  }
}

/** One station's dot. `ring` (the theme accent) marks it selected; `label` is its code (Show names). */
export function stationArt(status: string, color: string, big: boolean, ringColor: string | null, label: string | null): MarkerArt {
  const w = 96;
  const h = 64;
  const x = 48;
  const y = 42;
  const r = big ? 14 : 11;
  const tex = cachedTexture(`station|${status}|${color}|${big}|${ringColor}|${label}`, w, h, (ctx) => {
    if (ringColor) ring(ctx, x, y, r + 4.5, ringColor);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    statusMark(ctx, status, x, y, r);
    if (label) outlinedText(ctx, label, x, y - r - (ringColor ? 14 : 10), 12, "#1c1917");
  });
  return { tex, w, h, x, y, r };
}

/** A building's badge: open stations as a number, else the busiest status. A second disc says "several here". */
export function clusterArt(status: string, color: string, open: number, big: boolean, ringColor: string | null): MarkerArt {
  const w = 64;
  const h = 64;
  const x = 30;
  const y = 36;
  const r = big ? 18 : 15;
  const tex = cachedTexture(`cluster|${status}|${color}|${open}|${big}|${ringColor}`, w, h, (ctx) => {
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(x + 6, y - 5, r * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    if (ringColor) ring(ctx, x, y, r + 4.5, ringColor);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    if (open > 0) {
      ctx.font = `800 ${big ? 17 : 15}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(String(open), x, y + 1);
    } else {
      statusMark(ctx, status, x, y, r);
    }
  });
  return { tex, w, h, x, y, r };
}

/** A group pin (tip at x, y): its number in the head, dashed when the fix is rough, a square when checked in. */
export function pinArt(
  label: string,
  color: string,
  big: boolean,
  ringColor: string | null,
  dashed: boolean,
  manual: boolean,
): MarkerArt {
  const w = 44;
  const h = 60;
  const x = 22;
  const y = 56;
  const hy = 20;
  const r = big ? 15.5 : 13;
  const tex = cachedTexture(`pin|${label}|${color}|${big}|${ringColor}|${dashed}|${manual}`, w, h, (ctx) => {
    if (ringColor) ring(ctx, x, hy, r + 4, ringColor);
    ctx.beginPath();
    ctx.moveTo(x - 8, hy + r - 4);
    ctx.lineTo(x, y);
    ctx.lineTo(x + 8, hy + r - 4);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, hy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    if (dashed) ctx.setLineDash([5, 3.5]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `800 ${label.length > 2 ? 10 : 12}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, x, hy + 1);
    if (manual) {
      ctx.fillStyle = "#0891b2";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x + r - 7, hy - r - 3, 10, 10, 2.5);
      ctx.fill();
      ctx.stroke();
    }
  });
  return { tex, w, h, x, y, r };
}

/** "You" in Admin's accuracy check: a blue dot with a white rim, as phone maps show your own location. */
export function youArt(): MarkerArt {
  const w = 32;
  const h = 32;
  const r = 8;
  const tex = cachedTexture("you", w, h, (ctx) => {
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r + 5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(2,132,199,0.25)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.fillStyle = "#0284c7";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  });
  return { tex, w, h, x: w / 2, y: h / 2, r };
}

/** A small name tag (the dorms). */
export function tagArt(text: string): MarkerArt {
  const h = 20;
  const font = `700 10px ${FONT}`;
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + 16;
  const tex = cachedTexture(`tag|${text}`, w, h, (ctx) => {
    ctx.fillStyle = "rgba(20,18,30,0.62)";
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, w - 1, h - 1, (h - 1) / 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, w / 2, h / 2 + 0.5);
  });
  return { tex, w, h, x: w / 2, y: h / 2, r: h / 2 };
}

/** Pointer cursor over a marker (desktop). */
export function useHoverCursor() {
  const gl = useThree((s) => s.gl);
  return useMemo(
    () => ({
      onPointerOver: (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        gl.domElement.style.cursor = "pointer";
      },
      onPointerOut: () => {
        gl.domElement.style.cursor = "";
      },
    }),
    [gl],
  );
}

/**
 * A marker drawn at a fixed size on screen, always on top. The art's (x, y) point sits `dx`, `dy` CSS px from
 * `position` on screen (right and up), times `size`.
 */
export function Marker({
  position,
  art,
  dx = 0,
  dy = 0,
  opacity = 1,
  order = 0,
  additive = false,
  size = 1,
  onTap,
}: {
  position: Vec3;
  art: MarkerArt;
  dx?: number;
  dy?: number;
  opacity?: number;
  order?: number;
  additive?: boolean;
  /** Scale on screen; the dx, dy offsets scale with it. */
  size?: number;
  onTap?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const k = usePxScale() * size;
  const hover = useHoverCursor();
  const handlers = onTap
    ? {
        ...hover,
        onClick: (e: ThreeEvent<MouseEvent>) => {
          if (!isTap(e)) return;
          e.stopPropagation();
          onTap(e);
        },
      }
    : {};
  return (
    <sprite
      position={position}
      scale={[art.w * k, art.h * k, 1]}
      center={[(art.x - dx) / art.w, 1 - (art.y + dy) / art.h]}
      renderOrder={10 + order}
      {...handlers}
    >
      <spriteMaterial
        map={art.tex}
        sizeAttenuation={false}
        depthTest={false}
        depthWrite={false}
        transparent
        opacity={opacity}
        toneMapped={false}
        fog={false}
        blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </sprite>
  );
}

/** A tap area over a building or court footprint (not drawn). */
export function HitArea({ place, height, onTap }: { place: Placed; height: number; onTap: (e: ThreeEvent<MouseEvent>) => void }) {
  return (
    <mesh
      visible={false}
      position={[place.pos[0], height / 2, place.pos[1]]}
      rotation-y={place.rotY}
      onClick={(e) => {
        if (!isTap(e)) return;
        e.stopPropagation();
        onTap(e);
      }}
    >
      <boxGeometry args={[2 * place.hx + 0.8, height, 2 * place.hz + 0.8]} />
      <meshBasicMaterial />
    </mesh>
  );
}

export type GroundCircle = { x: number; z: number; r: number; color: string; dashed: boolean };
export type GroundOutline = { place: Placed; color: string };

/**
 * Marks painted flat on the ground, clipped to the slab: accuracy circles and outlines round open buildings. One
 * canvas, repainted when the marks change. (The dorm footprints are no longer drawn: the funfair's rides stand on
 * them.)
 */
export function GroundMarks({ circles, outlines, lite }: { circles: GroundCircle[]; outlines: GroundOutline[]; lite: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const pxPerUnit = (lite ? 1024 : 1600) / (EXTENT.x * 2);
  const { canvas, tex } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = Math.round(EXTENT.x * 2 * pxPerUnit);
    c.height = Math.round(EXTENT.z * 2 * pxPerUnit);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return { canvas: c, tex: t };
  }, [pxPerUnit]);
  useEffect(() => () => tex.dispose(), [tex]);

  const key = JSON.stringify([circles, outlines.map((o) => [o.place.pos, o.place.hx, o.place.hz, o.place.rotY, o.color])]);
  useEffect(() => {
    const ctx = canvas.getContext("2d")!;
    const px = (x: number) => (x + EXTENT.x) * pxPerUnit;
    const pz = (z: number) => (z + EXTENT.z) * pxPerUnit;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineJoin = "round";

    for (const o of outlines) {
      const m = 1.4;
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([sx, sz]) => localToWorld(o.place, sx * (o.place.hx + m), sz * (o.place.hz + m)));
      ctx.beginPath();
      corners.forEach(([x, z], i) => (i ? ctx.lineTo(px(x), pz(z)) : ctx.moveTo(px(x), pz(z))));
      ctx.closePath();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = o.color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(4, 0.9 * pxPerUnit);
      ctx.strokeStyle = o.color;
      ctx.stroke();
    }

    for (const c of circles) {
      ctx.beginPath();
      ctx.arc(px(c.x), pz(c.z), c.r * pxPerUnit, 0, Math.PI * 2);
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = c.color;
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = Math.max(2, 0.3 * pxPerUnit);
      ctx.strokeStyle = c.color;
      if (c.dashed) ctx.setLineDash([1.6 * pxPerUnit, 1.1 * pxPerUnit]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    tex.needsUpdate = true;
    invalidate();
    // `key` covers circles and outlines.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, canvas, tex, pxPerUnit, invalidate]);

  // over the raised ground under the A-row, the same canvas lies on its surface
  const raised = useMemo(() => plateauSurface(lite, 0.12), [lite]);
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={0.14} renderOrder={1}>
        <planeGeometry args={[EXTENT.x * 2, EXTENT.z * 2]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh geometry={raised} position-y={0.14} renderOrder={1} visible={circles.length + outlines.length > 0}>
        <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  );
}

/**
 * The funfair's ride names, each with its dorm ("LY3 · Vortexa Eye"): shown only when the camera is close, like
 * the courts' labels, whether or not place names are on.
 */
export function RideTags() {
  const k = usePxScale();
  const tags = useMemo(
    () => RIDE_TAGS.map((d) => ({ ...d, art: tagArt(d.name), at: new THREE.Vector3(d.pos[0], 0.4, d.pos[1]) })),
    [],
  );
  const refs = useRef<(THREE.Sprite | null)[]>([]);
  useFrame(({ camera }) => {
    tags.forEach((t, i) => {
      const sprite = refs.current[i];
      if (!sprite) return;
      const d = camera.position.distanceTo(t.at);
      const opacity = THREE.MathUtils.clamp((150 - d) / 40, 0, 1);
      sprite.visible = opacity > 0.02;
      (sprite.material as THREE.SpriteMaterial).opacity = opacity;
    });
  });
  return (
    <>
      {tags.map((t, i) => (
        <sprite
          key={t.name}
          ref={(s) => void (refs.current[i] = s)}
          position={t.at}
          scale={[t.art.w * k, t.art.h * k, 1]}
          renderOrder={5}
        >
          <spriteMaterial
            map={t.art.tex}
            sizeAttenuation={false}
            depthTest={false}
            depthWrite={false}
            transparent
            toneMapped={false}
            fog={false}
          />
        </sprite>
      ))}
    </>
  );
}

/** The glyph on each key's head, as on the Items page's KeyEmblem: Star (B1), Wheel (A3), Orbit (TF). */
function keyGlyph(ctx: CanvasRenderingContext2D, loc: ProjectorLocation, x: number, y: number, r: number, on: boolean) {
  const c = KEY_COLORS[loc];
  const g = ctx.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, on ? c.stops[0] : "#5b6478");
  g.addColorStop(0.6, on ? c.stops[1] : "#3a4153");
  g.addColorStop(1, on ? c.stops[2] : "#262b38");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = on ? c.main : "rgba(255,255,255,0.35)";
  ctx.stroke();
  const ink = on ? c.light : "rgba(255,255,255,0.6)";
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  if (loc === "B1") {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k * Math.PI) / 5 - Math.PI / 2;
      const rr = k % 2 ? r * 0.3 : r * 0.68;
      ctx[k ? "lineTo" : "moveTo"](x + rr * Math.cos(a), y + rr * Math.sin(a));
    }
    ctx.closePath();
    ctx.fill();
  } else if (loc === "A3") {
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
    for (let k = 0; k < 5; k++) {
      const a = (k * 2 * Math.PI) / 5 - Math.PI / 2;
      ctx.moveTo(x, y);
      ctx.lineTo(x + r * 0.6 * Math.cos(a), y + r * 0.6 * Math.sin(a));
    }
    ctx.stroke();
  } else {
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.68, r * 0.3, -0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * A funfair zone's sign: its key's glyph and code name ("Star"), short enough for a phone. Bright in the key's
 * colour when the zone is on, grey when off.
 */
export function zoneSignArt(zone: FunfairZone, on: boolean): MarkerArt {
  const loc = DEFAULT_ZONE_KEYS[zone];
  const title = PROJECTOR_CODE_NAMES[loc];
  const h = 26;
  const r = 9;
  const font = `800 12px ${FONT}`;
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = font;
  const w = Math.ceil(probe.measureText(title).width) + r * 2 + 18;
  const tex = cachedTexture(`zone|${zone}|${on}`, w, h, (ctx) => {
    const c = KEY_COLORS[loc];
    ctx.fillStyle = on ? "rgba(20,14,34,0.86)" : "rgba(20,18,30,0.7)";
    ctx.strokeStyle = on ? c.main : "rgba(255,255,255,0.28)";
    ctx.lineWidth = on ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(1, 1, w - 2, h - 2, (h - 2) / 2);
    ctx.fill();
    ctx.stroke();
    keyGlyph(ctx, loc, 4 + r, h / 2, r, on);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = font;
    ctx.fillStyle = on ? "#ffffff" : "rgba(255,255,255,0.7)";
    ctx.fillText(title, 4 + r * 2 + 6, h / 2 + 0.5);
  });
  return { tex, w, h, x: w / 2, y: h / 2, r: h / 2 };
}

/** Each zone's sign hangs this high over the zone's middle (world units), above the rides. */
const ZONE_SIGN_Y = 16;

/**
 * The funfair zones' signs, so a player sees which key lights which zone: "Star" with the Star key's glyph
 * (Items page). Shown with Show names, from afar; they fade out close up, where the rides' own tags take over.
 */
export function ZoneSigns({ power, size = 1 }: { power: FunfairPower; size?: number }) {
  const k = usePxScale();
  const signs = useMemo(
    () =>
      FUNFAIR_ZONES.map((zone) => ({
        zone,
        art: zoneSignArt(zone, power[zone] > 0),
        at: new THREE.Vector3(ZONE_CENTERS[zone][0], ZONE_SIGN_Y, ZONE_CENTERS[zone][1]),
      })),
    [power],
  );
  const refs = useRef<(THREE.Sprite | null)[]>([]);
  useFrame(({ camera }) => {
    signs.forEach((s, i) => {
      const sprite = refs.current[i];
      if (!sprite) return;
      const opacity = THREE.MathUtils.clamp((camera.position.distanceTo(s.at) - 45) / 30, 0, 1);
      sprite.visible = opacity > 0.02;
      (sprite.material as THREE.SpriteMaterial).opacity = opacity;
    });
  });
  return (
    <>
      {signs.map((s, i) => (
        <sprite
          key={s.zone}
          ref={(sp) => void (refs.current[i] = sp)}
          position={s.at}
          scale={[s.art.w * k * size, s.art.h * k * size, 1]}
          renderOrder={6}
        >
          <spriteMaterial
            map={s.art.tex}
            sizeAttenuation={false}
            depthTest={false}
            depthWrite={false}
            transparent
            toneMapped={false}
            fog={false}
          />
        </sprite>
      ))}
    </>
  );
}

/** Where to take the camera: closer to a point (same heading), in or out, or to a view. */
export type FlightPlan =
  | { kind: "focus"; target: Vec3; distance: number }
  | { kind: "zoom"; factor: number }
  | { kind: "to"; position: Vec3; target: Vec3 };
/** A FlightPlan with a new id each time, so the same plan twice still flies. */
export type Flight = FlightPlan & { id: number };

/** Glides the camera for a Flight; a drag or pinch takes over at once. A null flight stops it. */
export function CameraRig({ flight }: { flight: Flight | null }) {
  const controls = useThree((s) => s.controls) as MapControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const anim = useRef<{ t: number; p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3 } | null>(
    null,
  );
  useEffect(() => {
    if (!flight || !controls) {
      anim.current = null;
      return;
    }
    // Play out what is left of the last drag's damped motion now, so it doesn't nudge the camera off the
    // flight's end.
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = damping;
    const p0 = camera.position.clone();
    const t0 = controls.target.clone();
    let p1: THREE.Vector3;
    let t1: THREE.Vector3;
    if (flight.kind === "to") {
      p1 = new THREE.Vector3(...flight.position);
      t1 = new THREE.Vector3(...flight.target);
    } else if (flight.kind === "zoom") {
      t1 = t0.clone();
      const d = THREE.MathUtils.clamp(p0.distanceTo(t0) * flight.factor, controls.minDistance, controls.maxDistance);
      p1 = p0.clone().sub(t0).setLength(d).add(t0);
    } else {
      t1 = new THREE.Vector3(...flight.target);
      // Keep the heading; look down at least a little so the building does not hide its markers.
      const dir = new THREE.Spherical().setFromVector3(p0.clone().sub(t0));
      dir.radius = flight.distance;
      dir.phi = Math.min(dir.phi, 1.05);
      p1 = new THREE.Vector3().setFromSpherical(dir).add(t1);
    }
    anim.current = { t: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 0, p0, t0, p1, t1 };
    invalidate();
    // Ends the scene's intro swoop, if it is still running.
    controls.dispatchEvent({ type: "start", target: controls });
    const stop = () => {
      anim.current = null;
    };
    controls.addEventListener("start", stop);
    return () => controls.removeEventListener("start", stop);
  }, [flight, controls, camera, invalidate]);
  useFrame(({ invalidate }, dt) => {
    const a = anim.current;
    if (!a || !controls) return;
    invalidate();
    a.t = Math.min(1, a.t + dt / 0.7);
    const k = 1 - Math.pow(1 - a.t, 3);
    camera.position.lerpVectors(a.p0, a.p1, k);
    controls.target.lerpVectors(a.t0, a.t1, k);
    if (a.t >= 1) {
      anim.current = null;
    }
  });
  return null;
}
