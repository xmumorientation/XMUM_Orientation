// /api/admin/group-logins { refresh: "all" }: every group gets a new, unique
// 4-digit password and every phone of every group is signed out. Admin only.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  admin: true,
  rows: [] as { group_id: number; code: string; auth_user_id: string }[],
  passwords: {} as Record<string, string>,
  ended: [] as string[],
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: async () => (state.admin ? { id: "a1" } : null) }));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: async () => ({ data: state.rows.map((r) => ({ ...r })), error: null }),
      update: (patch: { code: string }) => ({
        eq: async (_col: string, groupId: number) => {
          state.rows.find((r) => r.group_id === groupId)!.code = patch.code;
          return { error: null };
        },
      }),
    }),
    auth: {
      admin: {
        updateUserById: async (id: string, { password }: { password: string }) => {
          state.passwords[id] = password;
          return { error: null };
        },
      },
    },
    rpc: async (_fn: string, { p_user_id }: { p_user_id: string }) => {
      state.ended.push(p_user_id);
      return { error: null };
    },
  }),
}));

const { POST } = await import("../src/app/api/admin/group-logins/route");
const call = () => POST(new Request("http://localhost/api/admin/group-logins", { method: "POST", body: '{"refresh":"all"}' }));

beforeEach(() => {
  state.admin = true;
  state.rows = [1, 2, 3].map((g) => ({ group_id: g, code: `100${g}`, auth_user_id: `u${g}` }));
  state.passwords = {};
  state.ended = [];
});

describe("new passwords for all groups", () => {
  it("is Admin only", async () => {
    state.admin = false;
    expect((await call()).status).toBe(403);
    expect(state.ended).toEqual([]);
  });

  it("gives every group a new unique code, saves it as the password, and signs every group out", async () => {
    expect((await call()).status).toBe(200);
    const codes = state.rows.map((r) => r.code);
    expect(new Set(codes).size).toBe(3);
    for (const c of codes) {
      expect(c).toMatch(/^\d{4}$/);
      expect(["1001", "1002", "1003"]).not.toContain(c);
    }
    for (const r of state.rows) expect(state.passwords[r.auth_user_id]).toBe(`vxum${r.code}`);
    expect(state.ended).toEqual(["u1", "u2", "u3"]);
  });
});
