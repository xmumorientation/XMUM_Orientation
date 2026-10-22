import { DEFAULT_PLACES } from "@/lib/projectorPlaces";
import { PIECES_PER_SET, type ProjectorLocation } from "@/lib/types";

import type { BoxGroup, HistoryEntry, ItemsData } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE DATA ONLY: not real game data. Kept for previews and the Replay demo.
// /inventory shows live data (useItemsData.ts); add ?demo=… to see these:
// ?demo=complete plays the T&F key completing (the 5th piece arrives, with a
// Replay button); ?demo=day1|day2|ready|taken|won shows the other states.
// GUARDIAN and SAMPLE_BOXES are also used by live data for now.
// Locations show as code names (Star, Wheel, Orbit) until the group completes
// that key or lights it (0098); sampleItems() gives those keys their default place.
// ─────────────────────────────────────────────────────────────────────────────

export const SAMPLE_SCENARIOS = ["day1", "day2", "ready", "taken", "won", "complete"] as const;
export type SampleScenario = (typeof SAMPLE_SCENARIOS)[number];

/** Also used by live data until Admin can set the Guardian spots. */
export const GUARDIAN: ItemsData["guardian"] = {
  B1: { place: "B1 lobby, beside the east staircase", hint: "Look for the Guardian in the light-blue vest.", photoUrl: null },
  A3: { place: "A3 main entrance, under the clock", hint: "Wait at the glass doors facing the car park.", photoUrl: null },
  TF: { place: "Track & Field, finish-line stand", hint: "Enter from the gate next to the volleyball court.", photoUrl: null },
};

const DAY1_HISTORY: HistoryEntry[] = [
  { id: "d1-6", kind: "box", day: 1, title: "Opened a gold box", detail: "From Mei, OC Team", amount: 5, time: "11:02" },
  { id: "d1-5", kind: "game", day: 1, title: "Station 9 · Win", detail: "Day 1 game", amount: 2, time: "10:48" },
  { id: "d1-4", kind: "game", day: 1, title: "Station 2 · Lost", detail: "PK vs Group 2 · base reward", amount: 1, time: "10:31" },
  { id: "d1-3", kind: "box", day: 1, title: "Opened a standard box", detail: "From Jason, HOF", amount: 2, time: "10:12" },
  { id: "d1-2", kind: "game", day: 1, title: "Station 5 · Win", detail: "Day 1 game", amount: 2, time: "09:55" },
  { id: "d1-1", kind: "game", day: 1, title: "Station 3 · Win", detail: "Day 1 game", amount: 2, time: "09:34" },
];

const DAY2_HISTORY: HistoryEntry[] = [
  { id: "d2-9", kind: "piece", day: 2, title: "Won {B1} piece #4", detail: "Station 11 · HOGM picked {B1}", amount: 0, time: "14:51" },
  { id: "d2-8", kind: "entry", day: 2, title: "Station 11 · High risk", detail: "Entry fee", amount: -6, time: "14:36" },
  { id: "d2-7", kind: "piece", day: 2, title: "Won {TF} piece #2", detail: "Station 6 · HOGM picked {B1} + {TF}", amount: 0, time: "14:30" },
  { id: "d2-6", kind: "entry", day: 2, title: "Station 6 · Medium risk", detail: "Entry fee", amount: -4, time: "14:14" },
  { id: "d2-5", kind: "game", day: 2, title: "Station 1 · Lost", detail: "No piece this time", amount: 0, time: "14:09" },
  { id: "d2-4", kind: "entry", day: 2, title: "Station 1 · Low risk", detail: "Entry fee", amount: -2, time: "13:58" },
  { id: "d2-3", kind: "piece", day: 2, title: "Won {B1} piece #2", detail: "Station 10 · HOGM picked {B1} + {TF}", amount: 0, time: "13:49" },
  { id: "d2-2", kind: "entry", day: 2, title: "Station 10 · Medium risk", detail: "Entry fee", amount: -4, time: "13:33" },
  { id: "d2-1", kind: "piece", day: 2, title: "Won {B1} piece #1", detail: "Station 2 · Random region", amount: 0, time: "13:20" },
  { id: "d2-0", kind: "entry", day: 2, title: "Station 2 · Low risk", detail: "Entry fee", amount: -2, time: "13:08" },
];

function sampleBoxes(goldLeft: number, goldOpened: number[], stdLeft: number, stdOpened: number[]): BoxGroup[] {
  return [
    { key: "gold", name: "Gold Box", label: "Gold", special: true, range: "4–6 tokens or a puzzle piece", mayGivePiece: true, unopened: goldLeft, opened: goldOpened },
    { key: "standard", name: "Standard Box", label: "Standard", special: false, range: "1–2 tokens each", unopened: stdLeft, opened: stdOpened },
  ];
}

/** Sample blind boxes (the ?demo previews and the Replay demo). Live data shows the group's real boxes. */
export const SAMPLE_BOXES: ItemsData["boxes"] = sampleBoxes(5, [5], 2, [2, 1, 1, 2]);

function base(): ItemsData {
  return {
    phase: "day2",
    timeLeft: "1:05:12",
    group: { id: 7, name: "Group 7" },
    mapUnlocked: false,
    places: { B1: null, A3: null, TF: null },
    images: { B1: null, A3: null, TF: null },
    tokens: { balance: 14 },
    costs: { low: 2, medium: 4, high: 6 },
    projectors: { B1: null, A3: null, TF: null },
    pieces: { B1: [1, 2, 4], A3: [3], TF: [2] },
    guardian: GUARDIAN,
    boxes: SAMPLE_BOXES,
    history: [...DAY2_HISTORY, ...DAY1_HISTORY],
  };
}

/** A sample shows the default place of each key it has completed or lit, as fn_my_projector_clues would (0098). */
export function sampleItems(scenario: SampleScenario = "day2"): ItemsData {
  const data = sampleScenario(scenario);
  const earned = (loc: ProjectorLocation) => data.pieces[loc].length >= PIECES_PER_SET || !!data.projectors[loc]?.isUs;
  const place = (loc: ProjectorLocation) => (earned(loc) ? DEFAULT_PLACES[loc] : null);
  return { ...data, places: { B1: place("B1"), A3: place("A3"), TF: place("TF") } };
}

function sampleScenario(scenario: SampleScenario): ItemsData {
  const data = base();
  switch (scenario) {
    case "day1":
      return {
        ...data,
        phase: "day1",
        timeLeft: "1:48:20",
        tokens: { balance: 14 },
        pieces: { B1: [], A3: [], TF: [] },
        boxes: sampleBoxes(5, [5], 1, [2]),
        history: DAY1_HISTORY,
      };
    case "ready":
      return {
        ...data,
        phase: "endgame",
        timeLeft: "24:51",
        mapUnlocked: true,
        tokens: { balance: 8 },
        pieces: { B1: [1, 2, 3, 4, 5], A3: [3], TF: [2] },
        history: [
          { id: "r-2", kind: "piece", day: 2, title: "Won {B1} piece #5", detail: "Station 12 · HOGM picked {B1}", amount: 0, time: "15:40" },
          { id: "r-1", kind: "entry", day: 2, title: "Station 12 · High risk", detail: "Entry fee", amount: -6, time: "15:24" },
          ...data.history,
        ],
      };
    case "complete":
      return {
        ...data,
        timeLeft: "48:10",
        pieces: { B1: [1, 2, 4], A3: [3], TF: [1, 2, 4, 5] },
      };
    case "taken":
      return {
        ...data,
        projectors: { B1: null, A3: { isUs: false }, TF: null },
      };
    case "won":
      return {
        ...data,
        phase: "endgame",
        timeLeft: "12:05",
        mapUnlocked: true,
        tokens: { balance: 8 },
        pieces: { B1: [1, 2, 3, 4, 5], A3: [3], TF: [2] },
        projectors: {
          B1: { isUs: true },
          A3: { isUs: false },
          TF: null,
        },
        history: [
          { id: "w-1", kind: "lit", day: 2, title: "{B1} projector lit", detail: "Part card scanned", amount: 0, time: "15:58" },
          ...data.history,
        ],
      };
    default:
      return data;
  }
}

/** What /inventory plays with no ?demo. */
export const DEFAULT_SCENARIO: SampleScenario = "complete";

/**
 * What ?demo=complete shows once it settles. (Freshie Home's puzzle card now
 * reads live data through useItemsData, like the Items page.)
 */
export function itemsShown(): ItemsData {
  return withLastTrackPiece(sampleItems(DEFAULT_SCENARIO));
}

/** The piece that completes T&F in the "complete" scenario. */
export function withLastTrackPiece(data: ItemsData): ItemsData {
  if (data.pieces.TF.includes(3)) return data;
  return {
    ...data,
    pieces: { ...data.pieces, TF: [...data.pieces.TF, 3].sort((a, b) => a - b) },
    history: [
      { id: `tf3-${Date.now()}`, kind: "piece", day: 2, title: "Won {TF} piece #3", detail: "Station 8 · HOGM picked {TF}", amount: 0, time: "15:32" },
      ...data.history,
    ],
  };
}
