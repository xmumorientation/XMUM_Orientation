// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeSupabase } from "./fakes";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/client", () => ({ supabaseBrowser: () => h.client }));
vi.mock("@/components/ProfileProvider", () => ({ useProfile: () => ({ role: "admin" }) }));
vi.mock("@/components/useConfig", () => ({ useConfig: () => ({ config: {}, loaded: true }) }));
vi.mock("@/lib/token-api", () => ({
  generateInitial12Groups: () => [],
  fetchTokenGroups: vi.fn(async () => [{ group_id: 1, group_name: "Group 1", current_tokens: 64, puzzles_count: 6, location_pieces: { 1: ["a", "b"], 2: [], 3: [] } }]),
  fetchTokenLogs: vi.fn(async () => []),
  fetchPuzzleInventory: vi.fn(async () => []),
  fetchGameConfigRules: vi.fn(async () => []),
  resetAllTokensAndPuzzles: vi.fn(),
  setTotalGroups: vi.fn(),
  updateGameConfigRule: vi.fn(),
  updateTokenLog: vi.fn(),
  deleteTokenLog: vi.fn(),
}));

import TokenControl from "@/components/token/TokenControl";

let fake: FakeSupabase;

beforeEach(() => {
  fake = fakeSupabase();
  h.client = fake;
});
afterEach(cleanup);

describe("TokenControl", () => {
  it("reviews a per-group token adjustment before calling the admin audit RPC", async () => {
    render(<TokenControl />);

    await screen.findAllByText("Group 1");
    await userEvent.click(await screen.findByRole("button", { name: "Adjust Tokens for Group 1" }));
    await userEvent.clear(screen.getByLabelText("Token change"));
    await userEvent.type(screen.getByLabelText("Token change"), "5");
    await userEvent.type(screen.getByLabelText("Reason"), "Score correction");
    await userEvent.click(screen.getByRole("button", { name: "Review Adjustment" }));

    expect(fake.rpc).not.toHaveBeenCalledWith("fn_admin_token_adjust", expect.anything());
    await userEvent.click(screen.getByRole("button", { name: "Confirm Adjustment" }));
    await waitFor(() => expect(fake.rpc).toHaveBeenCalledWith("fn_admin_token_adjust", expect.objectContaining({
      p_group_id: 1,
      p_delta: 5,
      p_reason: "Score correction",
    })));
  });

  it("rejects an adjustment outside the server's ±50-token limit before the confirmation step", async () => {
    render(<TokenControl />);

    await screen.findAllByText("Group 1");
    await userEvent.click(await screen.findByRole("button", { name: "Adjust Tokens for Group 1" }));
    await userEvent.clear(screen.getByLabelText("Token change"));
    await userEvent.type(screen.getByLabelText("Token change"), "100");
    await userEvent.click(screen.getByRole("button", { name: "Review Adjustment" }));

    expect(fake.rpc).not.toHaveBeenCalledWith("fn_admin_token_adjust", expect.anything());
    expect(screen.getByText("Enter a whole-number token change from -50 to +50, other than 0.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm Adjustment" })).toBeNull();
  });
});
