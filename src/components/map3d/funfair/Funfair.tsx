"use client";

import { memo } from "react";

import type { FunfairPower } from "@/lib/funfair";

import { FunfairCentral } from "./central";
import { FunfairEast } from "./east";
import { FunfairGate } from "./gate";
import { FunfairWest } from "./west";

// The Vortexa Funfair on the dorm land (docs/map3d-funfair-design.md): the three zones and the gate. Which zones
// are on comes from src/lib/funfair.ts (funfair_zones, or the default keys); the gate lights with the share of
// zones on.

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
