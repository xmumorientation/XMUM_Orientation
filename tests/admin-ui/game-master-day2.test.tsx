// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeSupabase } from "./fakes";

// PRD-001 AC-9: Day 2 Schedule and Game Master keep their RPCs, confirms,
// review steps and Undo. Neither component file is restyled in Slice 1; these
// tests pin their behaviour so the surrounding restyle cannot change it.

const h = vi.hoisted(() => ({ client: null as unknown, day2: {} as Record<string, unknown> }));
vi.mock("@/lib/supabase/client", () => ({ supabaseBrowser: () => h.client }));
vi.mock("@/components/useConfig", () => ({
  useConfig: () => ({ config: {}, brand: {}, loaded: true }),
  useProjectorPlaces: () => ({ B1: { name: "B1" }, A3: { name: "A3" }, TF: { name: "TF" } }),
}));
vi.mock("@/components/useDay2State", () => ({ useDay2State: () => h.day2 }));
vi.mock("@/components/ChallengeBanner", () => ({ ChallengeBanner: () => null }));
vi.mock("@/components/admin/FunfairLightGroup", () => ({ FunfairLightGroup: () => null }));
vi.mock("@/components/admin/FunfairZones", () => ({ FunfairZones: () => null }));

import { Day2Schedule } from "@/components/admin/Day2Schedule";
import { GameMaster } from "@/components/admin/GameMaster";

let fake: FakeSupabase;
const confirm = vi.fn(() => true);
const noop = () => {};
const rpcCalls = (name: string) => fake.rpc.mock.calls.filter((c) => c[0] === name).map((c) => c[1]);

beforeEach(() => {
  fake = fakeSupabase({ groups: [{ id: 1, name: "Falcons", color: null, token_balance: 10 }] });
  h.client = fake;
  confirm.mockReset();
  confirm.mockReturnValue(true);
  window.confirm = confirm;
  const seg = (id: string, label: string, start_min: number, hard = true, funfair = false) => ({
    id, label, start_min, easy: true, medium: true, hard, blindbox: true, funfair,
  });
  const segments = [seg("s1", "Opening", 0, false), seg("s2", "Hard Stations Open", 60), seg("s3", "Funfair", 105, true, true)];
  h.day2 = {
    state: { segments, manual_segment: null, overrides: {}, override_segment: null, game_on: false, game_started_at: null, game_ends_at: null },
    segment: "off",
    index: -1,
    label: "",
    manual: false,
    switches: { easy: true, medium: true, hard: true, blindbox: false, funfair: false },
    flipped: {},
    starts: null,
    reload: vi.fn(),
  };
});
afterEach(cleanup);

describe("Day 2 Schedule", () => {
  it("Start now asks first, then holds that segment by id", async () => {
    render(<Day2Schedule onError={noop} onNotice={noop} />);
    confirm.mockReturnValueOnce(false);
    await userEvent.click(screen.getAllByRole("button", { name: /start now/i })[0]);
    expect(confirm).toHaveBeenCalledWith("Start opening now? It holds until Back to Auto.");
    expect(rpcCalls("fn_day2_control")).toHaveLength(0);
    await userEvent.click(screen.getAllByRole("button", { name: /start now/i })[0]);
    await waitFor(() => expect(rpcCalls("fn_day2_control")).toEqual([{ p_action: "start_segment", p_segment: "s1" }]));
  });

  it("Back to auto shows while a segment is held", async () => {
    h.day2 = { ...h.day2, segment: "s2", index: 1, label: "Hard Stations Open", manual: true };
    render(<Day2Schedule onError={noop} onNotice={noop} />);
    await userEvent.click(screen.getByRole("button", { name: /back to auto/i }));
    await waitFor(() => expect(rpcCalls("fn_day2_control")).toEqual([{ p_action: "auto" }]));
  });

  it("one slider handle per segment after the first, and the heading stays", () => {
    render(<Day2Schedule onError={noop} onNotice={noop} />);
    expect(screen.getByRole("heading", { name: "Day 2 Inner Schedule" })).toBeTruthy();
    expect(screen.getAllByRole("slider").map((s) => s.getAttribute("aria-label"))).toEqual(["Hard Stations Open starts", "Funfair starts"]);
  });

  it("a handle for a segment that starts after the game ends stays on the rail, and the rail shows the whole plan", () => {
    const start = Date.now() - 13 * 60_000;
    h.day2 = {
      ...h.day2,
      state: { ...(h.day2.state as object), game_on: true, game_started_at: new Date(start).toISOString(), game_ends_at: new Date(start + 20 * 60_000).toISOString() },
      segment: "s1",
      index: 0,
      label: "Opening",
      starts: [start],
    };
    render(<Day2Schedule onError={noop} onNotice={noop} />);
    const lefts = screen.getAllByRole("slider").map((s) => (s as HTMLElement).style.left);
    // the rail shows the whole plan (0-115 min): 60 and 105 are on it, not stacked at the end
    expect(lefts.map((l) => Math.round(parseFloat(l)))).toEqual([52, 91]);
  });

  it("each card has Easy, Medium and Hard station switches and no Station Game switch", () => {
    render(<Day2Schedule onError={noop} onNotice={noop} />);
    expect(screen.getAllByRole("switch", { name: /^Hard Station, /i })).toHaveLength(3);
    expect(screen.queryByRole("switch", { name: /^Station Game/i })).toBeNull();
  });

  it("a switch on a card that is not running edits its saved default", async () => {
    render(<Day2Schedule onError={noop} onNotice={noop} />);
    await userEvent.click(screen.getByRole("switch", { name: "Hard Station, Hard Stations Open" }));
    await waitFor(() => expect(rpcCalls("fn_day2_control")).toHaveLength(1));
    const [call] = rpcCalls("fn_day2_control") as { p_action: string; p_segments: { id: string; hard: boolean }[] }[];
    expect(call.p_action).toBe("set_segments");
    expect(call.p_segments.find((g) => g.id === "s2")?.hard).toBe(false);
  });

  it("a switch on the running card asks: Change Default or Just Now", async () => {
    h.day2 = { ...h.day2, segment: "s2", index: 1, label: "Hard Stations Open" };
    render(<Day2Schedule onError={noop} onNotice={noop} />);
    await userEvent.click(screen.getByRole("switch", { name: "Hard Station, Hard Stations Open" }));
    expect(rpcCalls("fn_day2_control")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Just Now" }));
    await waitFor(() => expect(rpcCalls("fn_day2_control")).toEqual([{ p_action: "set_switch", p_switch: "hard", p_on: false }]));
  });

  it("Add Segment After splits at the midpoint and copies the switches", async () => {
    render(<Day2Schedule onError={noop} onNotice={noop} />);
    await userEvent.click(screen.getAllByRole("button", { name: /add segment after/i })[0]);
    await waitFor(() => expect(rpcCalls("fn_day2_control")).toHaveLength(1));
    const [call] = rpcCalls("fn_day2_control") as { p_segments: { id: string; start_min: number; hard: boolean }[] }[];
    expect(call.p_segments.map((g) => g.start_min)).toEqual([0, 30, 60, 105]);
    expect(call.p_segments[1].hard).toBe(false);
  });

  it("Remove asks first, then sends the list without it", async () => {
    render(<Day2Schedule onError={noop} onNotice={noop} />);
    await userEvent.click(screen.getAllByRole("button", { name: /^remove/i })[0]);
    await waitFor(() => expect(rpcCalls("fn_day2_control")).toHaveLength(1));
    const [call] = rpcCalls("fn_day2_control") as { p_segments: { id: string }[] }[];
    expect(call.p_segments.map((g) => g.id)).toEqual(["s1", "s3"]);
  });

  it("add and remove are off while a segment is held", () => {
    h.day2 = { ...h.day2, segment: "s2", index: 1, label: "Hard Stations Open", manual: true };
    render(<Day2Schedule onError={noop} onNotice={noop} />);
    for (const b of screen.getAllByRole("button", { name: /add segment after|^remove/i })) expect((b as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Game Master", () => {
  async function openAndReview() {
    render(<GameMaster onError={noop} onNotice={noop} />);
    await userEvent.click(screen.getByRole("button", { name: /game master/i }));
    await screen.findByText("Falcons", { selector: "b" });
    await userEvent.click(screen.getByRole("button", { name: /review change/i }));
  }

  it("AC-9: tokens go through a review step, then Confirm calls fn_admin_token_adjust", async () => {
    await openAndReview();
    expect(rpcCalls("fn_admin_token_adjust")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(rpcCalls("fn_admin_token_adjust")).toHaveLength(1));
    expect(rpcCalls("fn_admin_token_adjust")[0]).toMatchObject({ p_group_id: 1, p_delta: 2, p_reason: "" });
  });

  it("AC-9: Cancel in the review step calls nothing", async () => {
    await openAndReview();
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(rpcCalls("fn_admin_token_adjust")).toHaveLength(0);
  });

  it("AC-9: the Undo toast reverses the change", async () => {
    await openAndReview();
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(rpcCalls("fn_admin_token_adjust")).toHaveLength(2));
    expect(rpcCalls("fn_admin_token_adjust")[1]).toMatchObject({ p_group_id: 1, p_delta: -2, p_reason: "Undo: adjustment" });
  });
});
