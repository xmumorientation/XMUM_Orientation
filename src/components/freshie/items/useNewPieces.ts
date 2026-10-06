"use client";

import { useEffect, useRef, useState } from "react";

import { PIECES_PER_SET, PROJECTOR_LOCATIONS, type ProjectorLocation } from "@/lib/types";

import type { ItemsData } from "./types";

export type Arrival = {
  /** The piece number that just arrived. */
  piece: number;
  /** True when this piece completed the set of 5. */
  completed: boolean;
  /** Changes on every arrival, so animations restart. */
  id: number;
};

export type Arrivals = Partial<Record<ProjectorLocation, Arrival>>;

const SHOW_FOR_MS = 3200;

/**
 * Notices pieces that arrive while the page is open (not the ones already
 * there on first load) so the key can play its arrival or completion effect.
 */
export function useNewPieces(pieces: ItemsData["pieces"]): Arrivals {
  const previous = useRef(pieces);
  const timers = useRef<number[]>([]);
  const [arrivals, setArrivals] = useState<Arrivals>({});

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  useEffect(() => {
    const before = previous.current;
    previous.current = pieces;
    const found: Arrivals = {};
    for (const loc of PROJECTOR_LOCATIONS) {
      const added = pieces[loc].filter((n) => !before[loc].includes(n));
      if (added.length) {
        found[loc] = {
          piece: added[added.length - 1],
          completed: pieces[loc].length >= PIECES_PER_SET && before[loc].length < PIECES_PER_SET,
          id: Date.now(),
        };
      }
    }
    if (!Object.keys(found).length) return;
    setArrivals((current) => ({ ...current, ...found }));
    const timer = window.setTimeout(() => {
      timers.current = timers.current.filter((t) => t !== timer);
      setArrivals((current) => {
        const next = { ...current };
        for (const loc of Object.keys(found) as ProjectorLocation[]) {
          if (next[loc]?.id === found[loc]!.id) delete next[loc];
        }
        return next;
      });
    }, SHOW_FOR_MS);
    timers.current.push(timer);
  }, [pieces]);

  return arrivals;
}
