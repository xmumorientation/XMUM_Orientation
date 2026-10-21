// /api/group-join: the static group QR. GET mints links by role; POST signs in
// only with a real group token, using the group's CURRENT password.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { blindBoxToken } from "../src/lib/blindbox";

const state = vi.hoisted(() => ({
  role: "admin" as string | null,
  code: "4821" as string | null,
  signedInWith: null as { email: string; password: string } | null,
}));

vi.mock("@/lib/auth", () => ({
  requireRoleDetail: async (roles: string[]) =>
    state.role && roles.includes(state.role) ? { user: { id: "u1" }, role: state.role } : null,
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        single: async () => ({ data: { group_id: 3 } }),
        maybeSingle: async () => ({ data: state.code ? { code: state.code } : null }),
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: table === "groups" ? [{ id: 1 }, { id: 3 }] : [] }),
      };
      return query;
    },
  }),
  supabaseServer: async () => ({
    auth: {
      signInWithPassword: async (creds: { email: string; password: string }) => {
        state.signedInWith = creds;
        return { error: null };
      },
    },
  }),
}));

const { GET, POST } = await import("../src/app/api/group-join/route");

const post = (t: unknown) =>
  POST(new Request("http://localhost/api/group-join", { method: "POST", body: JSON.stringify({ t }) }));

async function urls(): Promise<Record<string, string>> {
  return (await (await GET()).json()).urls;
}

beforeEach(() => {
  process.env.NFC_TOKEN_SECRET = "test-secret-at-least-16-chars";
  process.env.NEXT_PUBLIC_SITE_URL = "xmum-orientation.vercel.app";
  state.role = "admin";
  state.code = "4821";
  state.signedInWith = null;
});

describe("/api/group-join", () => {
  it("gives Admin every group, a Faci only their own, nobody else anything", async () => {
    expect(Object.keys(await urls())).toEqual(["1", "3"]);
    state.role = "faci";
    expect(Object.keys(await urls())).toEqual(["3"]);
    for (const role of ["freshie", "hof", null]) {
      state.role = role;
      expect((await GET()).status).toBe(403);
    }
  });

  it("the link stays the same and signs in with the current password", async () => {
    const link = (await urls())["3"];
    expect(link).toMatch(/^https:\/\/xmum-orientation\.vercel\.app\/join\?g=/);
    const t = decodeURIComponent(link.split("?g=")[1]);

    state.code = "0007"; // Admin gave the group a new password
    expect((await urls())["3"]).toBe(link);
    expect((await post(t)).status).toBe(200);
    expect(state.signedInWith).toEqual({ email: "group-3@freshie.xmu.edu.my", password: "vxum0007" });
  });

  it("refuses forged, tampered and blind box tokens", async () => {
    const t = decodeURIComponent((await urls())["3"].split("?g=")[1]);
    for (const bad of [undefined, "", "abc.def", t.slice(0, -2) + "xx", blindBoxToken(3, 1)]) {
      expect((await post(bad)).status).toBe(400);
    }
    expect(state.signedInWith).toBeNull();
  });
});
