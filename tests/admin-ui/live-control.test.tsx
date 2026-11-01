// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, phase, type FakeSupabase } from "./fakes";

// Component tests for Live control (PRD-001 AC-3 to AC-8, AC-10). They run
// against a fake Supabase client and prove the controls still call the same
// RPCs with the same arguments and confirm prompts, whatever the markup is.

const h = vi.hoisted(() => ({
  client: null as unknown,
  timer: { phases: [] as unknown[], offsetMs: 0, tick: 0 },
  config: {} as Record<string, unknown>,
  countdown: { label: "", seconds: null as number | null, live: false, paused: false, itemId: null as number | null, nowId: null as number | null },
}));

vi.mock("@/lib/supabase/client", () => ({ supabaseBrowser: () => h.client }));
vi.mock("@/components/PhaseTimerProvider", () => ({ usePhaseTimer: () => h.timer }));
vi.mock("@/components/useConfig", () => ({ useConfig: () => ({ config: h.config, brand: {}, loaded: true }) }));
vi.mock("@/components/useEventCountdown", async (orig) => ({
  ...(await orig<typeof import("@/components/useEventCountdown")>()),
  useEventCountdown: () => h.countdown,
}));
vi.mock("@/components/admin/Day2Schedule", async () => {
  const { createElement } = await import("react");
  return { Day2Schedule: () => createElement("section", { "data-testid": "day2" }, "Day 2 inner schedule") };
});
vi.mock("@/components/admin/GameMaster", async () => {
  const { createElement } = await import("react");
  return { GameMaster: () => createElement("section", { "data-testid": "gm" }, "Game master") };
});

import { GameToggles } from "@/components/admin/GameToggles";
import { NowOnWelcome } from "@/components/admin/NowOnWelcome";
import AdminControlRoomPage from "@/app/(app)/admin/page";

const OPS = {
  tokens_in_circulation: 1234,
  transactions_count: 56,
  blindbox_claims: 7,
  blindbox_tokens_in: 89,
  pieces_granted: 10,
  sets_redeemed: 2,
  projectors_activated: 1,
};

let fake: FakeSupabase;
const confirm = vi.fn(() => true);

function setup(opts: { tables?: Record<string, unknown[]>; config?: Record<string, unknown>; phases?: unknown[] } = {}) {
  // Live control reads the switches from the game_config table; GameToggles reads useConfig.
  const gameConfig = Object.entries(opts.config ?? {}).map(([key, value]) => ({ key, value }));
  fake = fakeSupabase({ game_config: gameConfig, ...opts.tables }, { fn_live_ops: OPS });
  h.client = fake;
  h.config = opts.config ?? {};
  h.timer = { phases: opts.phases ?? [phase("day1", "Day 1 game", "pending"), phase("day2", "Day 2 game", "pending")], offsetMs: 0, tick: 0 };
  h.countdown = { label: "", seconds: null, live: false, paused: false, itemId: null, nowId: null };
}

beforeEach(() => {
  window.localStorage.clear();
  confirm.mockReset();
  confirm.mockReturnValue(true);
  vi.stubGlobal("confirm", confirm);
  window.confirm = confirm;
  setup();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const rpcCalls = (name: string) => fake.rpc.mock.calls.filter((c) => c[0] === name).map((c) => c[1]);

describe("Live control page", () => {
  it("AC-3: game, Now on Welcome, live numbers, Day 2 schedule, Game Master, then the danger zone", async () => {
    setup({ phases: [phase("day1", "Day 1 game", "ended"), phase("day2", "Day 2 game", "pending")] });
    render(<AdminControlRoomPage />);
    await screen.findByText("Tokens in circulation");
    const order = [
      screen.getByRole("button", { name: "Start Day 2 game" }),
      screen.getByRole("region", { name: "Now on the Welcome page" }),
      screen.getByText("Tokens in circulation"),
      screen.getByTestId("day2"),
      screen.getByTestId("gm"),
      screen.getByRole("region", { name: /danger zone/i }),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING, `block ${i}`).toBeTruthy();
    }
  });

  it("AC-3: Day 2 Schedule is not shown for Day 1", async () => {
    render(<AdminControlRoomPage />);
    await screen.findByText("Tokens in circulation");
    expect(screen.queryByTestId("day2")).toBeNull();
  });

  it("AC-4: the six switches and Reset games sit together in the danger zone, with no safe control", async () => {
    render(<AdminControlRoomPage />);
    await screen.findByText("Tokens in circulation");
    const zone = screen.getByRole("region", { name: /danger zone/i });
    const names = within(zone).getAllByRole("switch").map((s) => s.getAttribute("aria-label"));
    expect(names).toEqual([
      "Freeze token mutations",
      "Pause blind box buying",
      "Disable NFC activation",
      "Rehearsal mode",
      "Day 2 map layer",
      "NFC demo mode",
    ]);
    expect(within(zone).getByRole("button", { name: /reset games/i })).toBeTruthy();
    expect(screen.getAllByRole("switch")).toHaveLength(6);
    // no safe control inside the zone
    expect(within(zone).queryByRole("combobox", { name: "Day" })).toBeNull();
    expect(within(zone).queryByRole("button", { name: /start day/i })).toBeNull();
    expect(within(zone).queryByText("Tokens in circulation")).toBeNull();
    expect(zone.contains(screen.getByRole("region", { name: "Now on the Welcome page" }))).toBe(false);
  });

  it("AC-5: each switch shows ON or OFF as text, and the banner names every switch that is on", async () => {
    setup({ config: { rehearsal_mode: true, tokens_frozen: "true" } });
    render(<AdminControlRoomPage />);
    await screen.findByText("Tokens in circulation");
    const zone = screen.getByRole("region", { name: /danger zone/i });
    expect(within(zone).getAllByText(/^ON$/)).toHaveLength(2);
    expect(within(zone).getAllByText(/^OFF$/)).toHaveLength(4);
    const banner = screen.getByText(/2 overrides ON/).parentElement!;
    expect(banner.textContent).toContain("Freeze token mutations");
    expect(banner.textContent).toContain("Rehearsal mode");
  });

  it("AC-5: no override banner when every switch is off", async () => {
    render(<AdminControlRoomPage />);
    await screen.findByText("Tokens in circulation");
    expect(screen.queryByText(/overrides? ON/)).toBeNull();
  });

  it("AC-6: a switch calls fn_set_config with the same key and the inverted value", async () => {
    setup({ config: { rehearsal_mode: true } });
    render(<AdminControlRoomPage />);
    await screen.findByText("Tokens in circulation");
    await userEvent.click(screen.getByRole("switch", { name: "Freeze token mutations" }));
    await userEvent.click(screen.getByRole("switch", { name: "Rehearsal mode" }));
    await waitFor(() => expect(rpcCalls("fn_set_config")).toHaveLength(2));
    expect(rpcCalls("fn_set_config")).toEqual([
      { p_key: "tokens_frozen", p_value: true },
      { p_key: "rehearsal_mode", p_value: false },
    ]);
  });

  it("AC-6: Reset games asks first, and resets only after OK", async () => {
    setup({
      config: { rehearsal_mode: true },
      phases: [phase("day1", "Day 1 game", "ended"), phase("day2", "Day 2 game", "pending"), phase("endgame", "Endgame", "active")],
    });
    render(<AdminControlRoomPage />);
    await screen.findByText("Tokens in circulation");
    const reset = screen.getByRole("button", { name: /reset games/i });
    confirm.mockReturnValueOnce(false);
    await userEvent.click(reset);
    expect(confirm).toHaveBeenCalledWith(
      "Reset every game to Not started? Timers clear and every GM moves back to their Day 1 station. Tokens and pieces are not changed."
    );
    expect(rpcCalls("fn_phase_control")).toHaveLength(0);
    await userEvent.click(reset);
    await waitFor(() => expect(rpcCalls("fn_phase_control")).toHaveLength(2));
    expect(rpcCalls("fn_phase_control")).toEqual([
      { p_phase_key: "day1", p_action: "reset", p_extend_minutes: 0 },
      { p_phase_key: "endgame", p_action: "reset", p_extend_minutes: 0 },
    ]);
    expect(await screen.findByText("Games reset. Every GM is back on their Day 1 station.")).toBeTruthy();
  });

  it("AC-6: Reset games stays disabled outside Rehearsal mode and when every phase is pending", async () => {
    const { unmount } = render(<AdminControlRoomPage />);
    await screen.findByText("Tokens in circulation");
    expect((screen.getByRole("button", { name: /reset games/i }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    setup({ config: { rehearsal_mode: true } });
    render(<AdminControlRoomPage />);
    await screen.findByText("Tokens in circulation");
    expect((screen.getByRole("button", { name: /reset games/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("AC-7: the Day select saves the filter and shows both days' games for All", async () => {
    render(<AdminControlRoomPage />);
    await screen.findByText("Tokens in circulation");
    expect(screen.queryByRole("button", { name: "Start Day 2 game" })).toBeNull();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Day" }), "all");
    expect(window.localStorage.getItem("admin-day-filter")).toBe("all");
    expect(screen.getByRole("button", { name: "Start Day 1 game" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start Day 2 game" })).toBeTruthy();
  });

  it("AC-10: the seven tiles show the same labels and values, and refresh every 10 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<AdminControlRoomPage />);
    for (const [label, value] of [
      ["Tokens in circulation", "1234"],
      ["Transactions", "56"],
      ["Blind boxes sold", "7"],
      ["Box tokens paid in", "89"],
      ["Pieces granted", "10"],
      ["Sets redeemed", "2"],
      ["Projectors lit", "1/3"],
    ]) {
      const tile = (await screen.findByText(label)).parentElement!;
      expect(tile.textContent).toContain(value);
    }
    const before = rpcCalls("fn_live_ops").length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(rpcCalls("fn_live_ops").length).toBeGreaterThan(before);
  });
});

describe("Game start/end (GameToggles)", () => {
  const noop = () => {};

  it("AC-7: Start asks first and calls fn_phase_control start", async () => {
    render(<GameToggles day="Day 1" onError={noop} onNotice={noop} />);
    confirm.mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole("button", { name: "Start Day 1 game" }));
    expect(confirm).toHaveBeenCalledWith("Start Day 1 game? It runs for 90 min. Station statuses are not changed.");
    expect(rpcCalls("fn_phase_control")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Start Day 1 game" }));
    await waitFor(() => expect(rpcCalls("fn_phase_control")).toEqual([{ p_phase_key: "day1", p_action: "start", p_extend_minutes: 0 }]));
  });

  it("AC-7: End, +5 and Resume call the same RPC; only End asks first", async () => {
    const ends = new Date(Date.now() + 30 * 60_000).toISOString();
    setup({ phases: [phase("day1", "Day 1 game", "active", { ends_at: ends }), phase("day2", "Day 2 game", "pending")] });
    render(<GameToggles day="Day 1" onError={noop} onNotice={noop} />);
    expect(screen.getByRole("timer", { name: "Day 1 game time left" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "+5" }));
    expect(confirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "End Day 1 game" }));
    expect(confirm).toHaveBeenCalledWith("End Day 1 game? Station statuses are not changed.");
    await waitFor(() => expect(rpcCalls("fn_phase_control")).toHaveLength(2));
    expect(rpcCalls("fn_phase_control")).toEqual([
      { p_phase_key: "day1", p_action: "extend", p_extend_minutes: 5 },
      { p_phase_key: "day1", p_action: "end", p_extend_minutes: 0 },
    ]);
  });

  it("AC-7: Resume shows only while paused", async () => {
    setup({ phases: [phase("day1", "Day 1 game", "paused", { paused_remaining: 600 }), phase("day2", "Day 2 game", "pending")] });
    render(<GameToggles day="Day 1" onError={noop} onNotice={noop} />);
    await userEvent.click(screen.getByRole("button", { name: /resume/i }));
    await waitFor(() => expect(rpcCalls("fn_phase_control")).toEqual([{ p_phase_key: "day1", p_action: "resume", p_extend_minutes: 0 }]));
  });

  it("AC-7: game length Save writes the config and the phase", async () => {
    render(<GameToggles day="Day 1" onError={noop} onNotice={noop} />);
    const input = screen.getByRole("spinbutton", { name: "Day 1 game length in minutes" });
    expect((input as HTMLInputElement).value).toBe("90");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    fireEvent.change(input, { target: { value: "120" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rpcCalls("fn_set_config")).toEqual([{ p_key: "bonding_session_duration_day1", p_value: 120 }]));
    const update = fake.queries.find((q) => q.table === "phases" && q.ops.some(([m]) => m === "update"))!;
    expect(update.ops).toEqual([["update", [{ duration_minutes: 120 }]], ["eq", ["key", "day1"]]]);
  });

  it("AC-7: the stations disclosure lists each station and its select calls fn_set_station_status", async () => {
    setup({ tables: { stations: [{ id: 4, name: "Egg and Spoon", day: 1, status: "available" }, { id: 5, name: "Day 2 only", day: 2, status: "closed" }] } });
    render(<GameToggles day="Day 1" onError={noop} onNotice={noop} />);
    await userEvent.click(await screen.findByRole("button", { name: /1\/1 stations open/ }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Egg and Spoon status" }), "closed");
    expect(rpcCalls("fn_set_station_status")).toEqual([{ p_station_id: 4, p_status: "closed" }]);
    expect(screen.queryByRole("combobox", { name: "Day 2 only status" })).toBeNull();
  });
});

describe("Now on the Welcome page (NowOnWelcome)", () => {
  const noop = () => {};
  async function renderNow(over: Partial<typeof h.countdown> = {}) {
    setup({ tables: { schedule_items: [{ title: "Day 1 Game" }] } });
    h.countdown = { label: "DAY 1 GAME ENDS IN", seconds: 600, live: true, paused: false, itemId: 7, nowId: 7, ...over };
    render(<NowOnWelcome onError={noop} onNotice={noop} />);
    await act(async () => {});
    await act(async () => {});
  }

  it("AC-8: -5 min, +5 min and Resume call fn_schedule_timer with the same action and minutes", async () => {
    await renderNow({ paused: true });
    await userEvent.click(screen.getByRole("button", { name: /resume/i }));
    await userEvent.click(screen.getByRole("button", { name: "−5 min" }));
    await userEvent.click(screen.getByRole("button", { name: "+5 min" }));
    await waitFor(() => expect(rpcCalls("fn_schedule_timer")).toHaveLength(3));
    expect(rpcCalls("fn_schedule_timer")).toEqual([
      { p_item_id: 7, p_action: "resume", p_minutes: 0, p_end_at: null },
      { p_item_id: 7, p_action: "extend", p_minutes: -5, p_end_at: null },
      { p_item_id: 7, p_action: "extend", p_minutes: 5, p_end_at: null },
    ]);
  });

  it("AC-8: Stop keeps its confirm", async () => {
    await renderNow();
    confirm.mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole("button", { name: /stop/i }));
    expect(confirm).toHaveBeenCalledWith("Stop Day 1 Game now? The countdown moves to the next item.");
    expect(rpcCalls("fn_schedule_timer")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: /stop/i }));
    await waitFor(() => expect(rpcCalls("fn_schedule_timer")).toEqual([{ p_item_id: 7, p_action: "end", p_minutes: 0, p_end_at: null }]));
  });

  it("AC-8: shows the label and the countdown", async () => {
    await renderNow();
    expect(screen.getByText("DAY 1 GAME ENDS IN")).toBeTruthy();
    expect(screen.getByRole("timer").textContent).toContain("00:10:00");
  });
});
