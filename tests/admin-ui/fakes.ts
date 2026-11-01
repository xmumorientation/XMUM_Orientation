import { vi } from "vitest";

import type { Phase } from "@/lib/types";

// A stand-in for the Supabase browser client used by the admin component tests.
// Every query chain is recorded as [method, args] so a test can assert the exact
// query a page builds; awaiting a chain resolves to the table's fixture rows.
export type Op = [method: string, args: unknown[]];

export function fakeSupabase(tables: Record<string, unknown[]> = {}, rpcData: Record<string, unknown> = {}) {
  const queries: { table: string; ops: Op[] }[] = [];
  const rpc = vi.fn(async (name: string, args?: unknown) => {
    void args;
    return { data: rpcData[name] ?? {}, error: null };
  });
  const from = vi.fn((table: string) => {
    const ops: Op[] = [];
    queries.push({ table, ops });
    let single = false;
    const settle = () => {
      const rows = tables[table] ?? [];
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    };
    const chain: unknown = new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(settle()).then(resolve, reject);
          }
          return (...args: unknown[]) => {
            ops.push([prop, args]);
            if (prop === "single") single = true;
            return chain;
          };
        },
      }
    );
    return chain;
  });
  const channel = () => {
    const ch = { on: () => ch, subscribe: () => ch };
    return ch;
  };
  return { rpc, from, channel, removeChannel: vi.fn(), queries };
}

export type FakeSupabase = ReturnType<typeof fakeSupabase>;

export function phase(key: string, name: string, state: Phase["state"], extra: Partial<Phase> = {}): Phase {
  return {
    id: key === "day1" ? 1 : key === "day2" ? 2 : 3,
    key,
    name,
    duration_minutes: 90,
    state,
    started_at: null,
    ends_at: null,
    paused_remaining: null,
    is_endgame: false,
    sort_order: 1,
    ...extra,
  };
}
