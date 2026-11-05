import { beforeEach, expect, it, vi } from "vitest";
import type { FeedSource } from "../src/lib/sharedFeed";
import type { ScoreboardState } from "../src/components/useScoreboard";

const { rpc, capture } = vi.hoisted(() => ({ rpc: vi.fn(), capture: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ supabaseBrowser: () => ({ rpc }) }));
vi.mock("@/lib/sharedFeed", () => ({
  useSharedFeed: (_key: string, make: () => unknown) => capture(make()),
  reloadSharedFeed: vi.fn(),
}));
import { useScoreboardState } from "../src/components/useScoreboard";

let source: FeedSource<ScoreboardState>;
beforeEach(() => {
  vi.clearAllMocks();
  capture.mockImplementation((value: FeedSource<ScoreboardState>) => { source = value; });
  useScoreboardState();
});
it("distinguishes an initial failure from an empty scoreboard", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "Offline" } });
  expect(await source.load(undefined)).toEqual({ rows: undefined, updatedAt: null, failed: true });
});
it("retains the last scores and their timestamp after a failed refresh", async () => {
  const previous = { rows: [{ id: 1, name: "Group 1", color: null, token_balance: 20 }], updatedAt: 123, failed: false };
  rpc.mockRejectedValue(new Error("Network unavailable"));
  expect(await source.load(previous)).toEqual({ ...previous, failed: true });
});
it("clears the failure and timestamps a successful empty response", async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  const result = await source.load({ rows: undefined, updatedAt: null, failed: true });
  expect(result?.rows).toEqual([]);
  expect(result?.failed).toBe(false);
  expect(result?.updatedAt).toEqual(expect.any(Number));
});
