"use client";

import { memo } from "react";

import type { MapLightbulb, ProjectorLocation } from "@/lib/types";

import { FunfairCentral } from "./central";
import type { ZoneKey } from "./common";
import { FunfairEast } from "./east";
import { FunfairGate } from "./gate";
import { FunfairWest } from "./west";

// The Vortexa Funfair on the dorm land (docs/map3d-funfair-design.md): the three zones and the gate. A zone
// powers up when the lightbulb (key) tied to it is lit; the gate lights with the share of zones on.

/** Each zone's power: 0 off, 1 on. */
export type FunfairPower = Record<ZoneKey, number>;

export const FUNFAIR_OFF: FunfairPower = { west: 0, central: 0, east: 0 };

/** The lightbulb that powers each zone. Fixed for now; Admin will choose them (funfair_zones, not built yet). */
export const ZONE_KEYS: Record<ZoneKey, ProjectorLocation> = { east: "B1", west: "A3", central: "TF" };

/** The zones on for the lit bulbs. */
export function funfairFromBulbs(bulbs: Pick<MapLightbulb, "location" | "activated_at">[]): FunfairPower {
  const lit = new Set(bulbs.filter((b) => b.activated_at).map((b) => b.location));
  const on = (zone: ZoneKey) => (lit.has(ZONE_KEYS[zone]) ? 1 : 0);
  return { west: on("west"), central: on("central"), east: on("east") };
}

/** `?funfair=1,0,1` (west, central, east), for dev pages; null when absent or malformed. */
export function parseFunfair(value: string | null): FunfairPower | null {
  const v = value?.split(",").map(Number);
  if (!v || v.length !== 3 || v.some((n) => n !== 0 && n !== 1)) return null;
  return { west: v[0], central: v[1], east: v[2] };
}

export const anyZoneOn = (p: FunfairPower) => p.west > 0 || p.central > 0 || p.east > 0;

export const Funfair = memo(
  function Funfair({ power, night, lite }: { power: FunfairPower; night: boolean; lite: boolean }) {
    const share = ((power.west > 0 ? 1 : 0) + (power.central > 0 ? 1 : 0) + (power.east > 0 ? 1 : 0)) / 3;
    return (
      <>
        <FunfairWest power={power.west} night={night} lite={lite} />
        <FunfairCentral power={power.central} night={night} lite={lite} />
        <FunfairEast power={power.east} night={night} lite={lite} />
        <FunfairGate power={share} night={night} lite={lite} />
      </>
    );
  },
  (a, b) =>
    a.night === b.night &&
    a.lite === b.lite &&
    a.power.west === b.power.west &&
    a.power.central === b.power.central &&
    a.power.east === b.power.east,
);
