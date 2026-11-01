// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { auditSentence, describeAudit, type AuditNames } from "@/lib/auditLog";
import type { AuditEntry } from "@/lib/types";

import { fakeSupabase, type FakeSupabase, type Op } from "./fakes";

// Audit page (PRD-001 AC-11): the same Supabase query for every filter, and a
// three-column table (When, Who, What happened) with one plain sentence.

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/client", () => ({ supabaseBrowser: () => h.client }));

import AdminAuditPage from "@/app/(app)/admin/audit/page";

const row = (id: number, over: Partial<AuditEntry> = {}): AuditEntry => ({
  id,
  actor: "u1",
  actor_role: "admin",
  action: "tokens.adjust",
  target: "group:7",
  detail: { delta: 5, balance_after: 25, reason: "bonus" },
  created_at: new Date().toISOString(),
  ...over,
});

let fake: FakeSupabase;
function setup(rows: AuditEntry[]) {
  fake = fakeSupabase({
    audit_log: rows,
    profiles: [{ id: "u1", full_name: "Priya" }],
    groups: [{ id: 7, name: "Group 7", display_name: null, color: null }],
  });
  h.client = fake;
}
const auditQueries = () => fake.queries.filter((q) => q.table === "audit_log");
const lastOps = (): Op[] => auditQueries().at(-1)!.ops;

beforeEach(() => setup([row(1)]));
afterEach(cleanup);

describe("Audit page query", () => {
  it("AC-11: the first load is newest first, 200 rows plus one, no filter", async () => {
    render(<AdminAuditPage />);
    await screen.findByText("Added 5 tokens to Group 7 (bonus)");
    expect(auditQueries()[0].ops).toEqual([
      ["select", ["*"]],
      ["order", ["created_at", { ascending: false }]],
      ["limit", [201]],
    ]);
  });

  it("AC-11: an action chip, a role chip and the text input build the same filters", async () => {
    setup([row(1), row(2, { action: "game.start", actor_role: "gm", target: "phase:day1", detail: {} })]);
    render(<AdminAuditPage />);
    await screen.findByText("Added 5 tokens to Group 7 (bonus)");

    await userEvent.click(screen.getByRole("button", { name: "tokens" }));
    await waitFor(() => expect(lastOps()).toContainEqual(["ilike", ["action", "%tokens.%"]]));

    await userEvent.click(screen.getByRole("button", { name: "Game Master" }));
    await waitFor(() => expect(lastOps()).toContainEqual(["eq", ["actor_role", "gm"]]));

    await userEvent.click(screen.getByRole("button", { name: "System" }));
    await waitFor(() => expect(lastOps()).toContainEqual(["is", ["actor_role", null]]));

    await userEvent.click(screen.getByRole("button", { name: "Anyone" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "blindbox." } });
    await waitFor(() => expect(lastOps()).toContainEqual(["ilike", ["action", "%blindbox.%"]]));
  });

  it("AC-11: Load More asks for 200 more rows", async () => {
    setup(Array.from({ length: 201 }, (_, i) => row(i + 1)));
    render(<AdminAuditPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Load More" }));
    await waitFor(() => expect(lastOps()).toContainEqual(["limit", [401]]));
  });

  it("AC-11: no Load More when there is nothing more", async () => {
    render(<AdminAuditPage />);
    await screen.findByText("Added 5 tokens to Group 7 (bonus)");
    expect(screen.queryByRole("button", { name: "Load More" })).toBeNull();
  });
});

describe("Audit table", () => {
  it("AC-11: three columns, When, Who and What happened", async () => {
    render(<AdminAuditPage />);
    await screen.findByText("Added 5 tokens to Group 7 (bonus)");
    expect(screen.getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["When", "Who", "What happened"]);
  });

  it("AC-11: Who is the role and the person, or System", async () => {
    setup([row(1), row(2, { actor: null, actor_role: null, action: "game.expired", target: null, detail: { count: 2 } })]);
    render(<AdminAuditPage />);
    await screen.findByText("Admin Priya");
    expect(within(screen.getByRole("table")).getByText("System")).toBeTruthy();
    expect(screen.getByText("Timer ran out: Games (2 games ended)")).toBeTruthy();
  });

  it("AC-11: the raw JSON stays under View details", async () => {
    render(<AdminAuditPage />);
    await screen.findByText("Added 5 tokens to Group 7 (bonus)");
    const details = screen.getByText("View details").closest("details")!;
    expect(within(details).getByText(/"reason": "bonus"/)).toBeTruthy();
  });

  it("AC-11: an entry with no detail has no View details", async () => {
    setup([row(1, { action: "game.start", target: "phase:day1", detail: {} })]);
    render(<AdminAuditPage />);
    await screen.findByText(/Game started/);
    expect(screen.queryByText("View details")).toBeNull();
  });

  it("AC-11: empty state", async () => {
    setup([]);
    render(<AdminAuditPage />);
    expect(await screen.findByText("No entries match.")).toBeTruthy();
  });

  it("AC-11: loading state shows the spinner", () => {
    render(<AdminAuditPage />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
  });
});

describe("auditSentence", () => {
  const names: AuditNames = { groups: {}, stations: { 3: "Egg and Spoon" }, boxTypes: {}, phases: { day1: "Day 1 game" }, sessions: {}, people: {} };
  const say = (e: AuditEntry) => auditSentence(describeAudit(e, names), e);

  it("writes a token change as Added/Took, with the typed reason in brackets", () => {
    expect(say(row(1))).toBe("Added 5 tokens to Group 7 (bonus)");
    expect(say(row(2, { detail: { delta: -1, balance_after: 4, reason: "wrong scan" } }))).toBe("Took 1 token from Group 7 (wrong scan)");
    expect(say(row(3, { detail: { delta: 20, balance_after: 40 } }))).toBe("Added 20 tokens to Group 7");
  });

  it("writes other entries as one line with the detail in brackets", () => {
    expect(say(row(4, { action: "station.status", target: "station:3", detail: { status: "closed" } }))).toBe("Status changed: Egg and Spoon (now Closed)");
    expect(say(row(5, { action: "game.start", target: "phase:day1", detail: {} }))).toBe("Game started: Day 1 game");
  });
});
