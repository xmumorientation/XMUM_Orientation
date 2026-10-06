import type { HistoryEntry, ItemsData } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE DATA ONLY: not real game data.
// Every Freshie and Faci sees these made-up tokens, pieces and boxes on the
// Items page (marked "Sample data" in the header) until the page reads the
// live game data: fn_my_inventory_group, fn_my_puzzle_inventory,
// fn_group_blind_boxes and fn_lighting_zones from bonding-session.
// TODO: replace with live data before the event; keep ?demo for previews.
//
// /inventory with no ?demo plays "complete": the T&F key completing (the 5th
// piece arrives). Add ?demo=day1|day2|ready|taken|won to see the other states.
// ─────────────────────────────────────────────────────────────────────────────

export const SAMPLE_SCENARIOS = ["day1", "day2", "ready", "taken", "won", "complete"] as const;
export type SampleScenario = (typeof SAMPLE_SCENARIOS)[number];

const GUARDIAN: ItemsData["guardian"] = {
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
  { id: "d2-9", kind: "piece", day: 2, title: "Won B1 piece #4", detail: "Station 11 · HOGM picked B1", amount: 0, time: "14:51" },
  { id: "d2-8", kind: "entry", day: 2, title: "Station 11 · High risk", detail: "Entry fee", amount: -6, time: "14:36" },
  { id: "d2-7", kind: "piece", day: 2, title: "Won T&F piece #2", detail: "Station 6 · HOGM picked B1 + T&F", amount: 0, time: "14:30" },
  { id: "d2-6", kind: "entry", day: 2, title: "Station 6 · Medium risk", detail: "Entry fee", amount: -4, time: "14:14" },
  { id: "d2-5", kind: "game", day: 2, title: "Station 1 · Lost", detail: "No piece this time", amount: 0, time: "14:09" },
  { id: "d2-4", kind: "entry", day: 2, title: "Station 1 · Low risk", detail: "Entry fee", amount: -2, time: "13:58" },
  { id: "d2-3", kind: "piece", day: 2, title: "Won B1 piece #2", detail: "Station 10 · HOGM picked B1 + T&F", amount: 0, time: "13:49" },
  { id: "d2-2", kind: "entry", day: 2, title: "Station 10 · Medium risk", detail: "Entry fee", amount: -4, time: "13:33" },
  { id: "d2-1", kind: "piece", day: 2, title: "Won B1 piece #1", detail: "Station 2 · Random region", amount: 0, time: "13:20" },
  { id: "d2-0", kind: "entry", day: 2, title: "Station 2 · Low risk", detail: "Entry fee", amount: -2, time: "13:08" },
];

function base(): ItemsData {
  return {
    phase: "day2",
    timeLeft: "1:05:12",
    group: { id: 7, name: "Group 7" },
    tokens: { balance: 14 },
    costs: { low: 2, medium: 4, high: 6 },
    projectors: { B1: null, A3: null, TF: null },
    pieces: { B1: [1, 2, 4], A3: [3], TF: [2] },
    guardian: GUARDIAN,
    boxes: { gold: { unopened: 1, opened: [5] }, standard: { unopened: 2, opened: [2, 1, 1, 2] } },
    history: [...DAY2_HISTORY, ...DAY1_HISTORY],
  };
}

export function sampleItems(scenario: SampleScenario = "day2"): ItemsData {
  const data = base();
  switch (scenario) {
    case "day1":
      return {
        ...data,
        phase: "day1",
        timeLeft: "1:48:20",
        tokens: { balance: 14 },
        pieces: { B1: [], A3: [], TF: [] },
        boxes: { gold: { unopened: 1, opened: [5] }, standard: { unopened: 1, opened: [2] } },
        history: DAY1_HISTORY,
      };
    case "ready":
      return {
        ...data,
        phase: "endgame",
        timeLeft: "24:51",
        tokens: { balance: 8 },
        pieces: { B1: [1, 2, 3, 4, 5], A3: [3], TF: [2] },
        history: [
          { id: "r-2", kind: "piece", day: 2, title: "Won B1 piece #5", detail: "Station 12 · HOGM picked B1", amount: 0, time: "15:40" },
          { id: "r-1", kind: "entry", day: 2, title: "Station 12 · High risk", detail: "Entry fee", amount: -6, time: "15:24" },
          ...data.history,
        ],
      };
    case "complete":
      return {
        ...data,
        phase: "endgame",
        timeLeft: "27:40",
        pieces: { B1: [1, 2, 4], A3: [3], TF: [1, 2, 4, 5] },
      };
    case "taken":
      return {
        ...data,
        projectors: { B1: null, A3: { groupId: 4, name: "Group 4", color: "#fc9e3d", isUs: false }, TF: null },
      };
    case "won":
      return {
        ...data,
        phase: "endgame",
        timeLeft: "12:05",
        tokens: { balance: 8 },
        pieces: { B1: [1, 2, 3, 4, 5], A3: [3], TF: [2] },
        projectors: {
          B1: { groupId: 7, name: "Group 7", color: "#0dfcfd", isUs: true },
          A3: { groupId: 4, name: "Group 4", color: "#fc9e3d", isUs: false },
          TF: null,
        },
        history: [
          { id: "w-1", kind: "lit", day: 2, title: "B1 projector lit", detail: "Part card scanned", amount: 0, time: "15:58" },
          ...data.history,
        ],
      };
    default:
      return data;
  }
}

/** The piece that completes T&F in the "complete" scenario. */
export function withLastTrackPiece(data: ItemsData): ItemsData {
  if (data.pieces.TF.includes(3)) return data;
  return {
    ...data,
    pieces: { ...data.pieces, TF: [...data.pieces.TF, 3].sort((a, b) => a - b) },
    history: [
      { id: `tf3-${Date.now()}`, kind: "piece", day: 2, title: "Won T&F piece #3", detail: "Station 8 · HOGM picked T&F", amount: 0, time: "15:32" },
      ...data.history,
    ],
  };
}
