// How audit rows read in HOGM's Log (lib/auditLog).
import { describe, expect, it } from "vitest";

import { actionsOf, AUDIT_ACTIONS, describeAudit, type AuditNames } from "@/lib/auditLog";
import type { AuditEntry } from "@/lib/types";

const names: AuditNames = {
  groups: { 1: { name: "Group 1", color: null }, 2: { name: "Group 2", color: null } },
  stations: {},
  boxTypes: {},
  phases: { day2: "Day 2 Game" },
  sessions: {},
  people: {},
};

const row = (action: string, target: string | null, detail: Record<string, unknown>): AuditEntry => ({
  id: 1,
  actor: null,
  actor_role: "admin",
  action,
  target,
  detail,
  created_at: new Date().toISOString(),
});

describe("game start / end", () => {
  it("shows the live database's session.* rows, worded like phase.*", () => {
    for (const [action, verb] of [
      ["start", "Started"],
      ["pause", "Paused"],
      ["resume", "Resumed"],
      ["end", "Ended"],
      ["reset", "Reset"],
    ]) {
      expect(AUDIT_ACTIONS[`session.${action}`]).toBe("game");
      expect(describeAudit(row(`session.${action}`, "phase:day2", {}), names)).toMatchObject({ object: "Day 2 Game", action: verb });
      if (action !== "reset") expect(describeAudit(row(`phase.${action}`, "phase:day2", {}), names).action).toBe(verb);
    }
    expect(describeAudit(row("session.extend", "phase:day2", { extend_minutes: 10 }), names)).toMatchObject({ action: "Extended", detail: "+10 min" });
  });

  it("the Games & settings filter asks for them", () => {
    expect(actionsOf(["game"])).toEqual(expect.arrayContaining(["session.start", "session.end", "session.extend"]));
  });
});

describe("Admin token edits", () => {
  it("an edit shows the change in the balance and what it was", () => {
    const r = describeAudit(
      row("tokens.log_edit", "group:1", {
        before: { group_id: 1, amount: 1, type: "DAY1_GAME", notes: "x" },
        after: { group_id: 1, amount: 3, type: "DAY1_GAME", notes: "fixed" },
        balance_after: 65,
      }),
      names
    );
    expect(r).toMatchObject({ object: "Group 1", group: 1, action: "Transaction edited", tokens: 2 });
    expect(r.detail).toBe('was +1, now +3 · "fixed" · balance 65');
    expect(AUDIT_ACTIONS["tokens.log_edit"]).toBe("tokens");
  });

  it("an edit that moves the entry to another group shows where from, and no single balance change", () => {
    const r = describeAudit(
      row("tokens.log_edit", "group:2", {
        before: { group_id: 1, amount: 5, type: "DAY1_GAME", notes: "" },
        after: { group_id: 2, amount: 5, type: "DAY1_GAME", notes: "" },
        balance_after: 8,
      }),
      names
    );
    expect(r.tokens).toBeUndefined();
    expect(r.detail).toContain("moved from Group 1");
  });

  it("a delete shows the amount taken off", () => {
    const r = describeAudit(row("tokens.log_delete", "group:1", { group_id: 1, amount: 5, type: "DAY1_GAME", notes: "win", balance_after: 5 }), names);
    expect(r).toMatchObject({ action: "Transaction deleted", tokens: -5, group: 1 });
    expect(r.detail).toBe('was +5 (DAY1_GAME) · "win" · balance 5');
    expect(AUDIT_ACTIONS["tokens.log_delete"]).toBe("tokens");
  });
});

describe("old settings", () => {
  it("gm_blindbox_* no longer shows as a raw key", () => {
    expect(describeAudit(row("config.set", "config:gm_blindbox_stock", { value: 0 }), names)).toMatchObject({
      object: "GM blind box (old setting)",
      detail: "stock: 0",
    });
  });
});
