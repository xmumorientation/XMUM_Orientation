// /api/blindbox/links: who may ask, input checks, and the links it builds.
// Who sees WHICH assignments is RLS on the caller's own session (covered by
// db.test.ts); here the database is a stub that records the query.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { verifyBlindBoxToken } from "../../src/lib/blindbox";

const state = vi.hoisted(() => ({
  role: "admin" as string | null,
  rows: [] as unknown[],
  error: null as { message: string } | null,
}));

vi.mock("@/lib/auth", () => ({
  requireRoleDetail: async (roles: string[]) =>
    state.role && roles.includes(state.role) ? { user: { id: "u1" }, role: state.role } : null,
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    from: () => {
      const query = {
        select: () => query,
        then: (resolve: (v: unknown) => void) => resolve({ data: state.rows, error: state.error }),
      };
      return query;
    },
  }),
}));

const { POST } = await import("../../src/app/api/blindbox/links/route");

const call = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/blindbox/links", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  process.env.NFC_TOKEN_SECRET = "test-secret-at-least-16-chars";
  process.env.NEXT_PUBLIC_SITE_URL = "xmum-orientation.vercel.app";
  state.role = "admin";
  state.rows = [];
  state.error = null;
});

describe("/api/blindbox/links", () => {
  it("refuses Freshies, Facis, GMs and signed-out callers", async () => {
    for (const role of ["freshie", "faci", "gm", "guardian_gm", null]) {
      state.role = role;
      expect((await call({})).status).toBe(403);
    }
  });

  it("lets every seller role ask", async () => {
    for (const role of ["committee", "hof", "hogm", "admin"]) {
      state.role = role;
      expect((await call({})).status).toBe(200);
    }
  });

  it("rejects bad ids", async () => {
    expect((await call({ ids: "1" })).status).toBe(400);
    expect((await call({ ids: [1, "2"] })).status).toBe(400);
    expect((await call({ ids: [1.5] })).status).toBe(400);
    expect((await call({ ids: Array.from({ length: 501 }, (_, i) => i) })).status).toBe(400);
  });

  it("builds one https link per seller from its current QR version, for the ids asked", async () => {
    state.rows = [
      { id: 10, active: true, seller: { id: 3, qr_version: 123456789 } },
      { id: 11, active: false, seller: [{ id: 3, qr_version: 123456789 }] }, // PostgREST may return an array
      { id: 12, active: true, seller: null }, // seller hidden by RLS: no link
    ];
    const res = await call({ ids: [10, 11, 12] });
    const { links } = (await res.json()) as { links: { id: number; active: boolean; url: string }[] };
    expect(links.map((l) => l.id)).toEqual([10, 11]);
    expect(links[0].url).toBe(links[1].url); // one QR per seller
    expect(links[1].active).toBe(false);
    const url = new URL(links[0].url);
    expect(url.origin).toBe("https://xmum-orientation.vercel.app");
    expect(url.pathname).toBe("/blindbox");
    expect(verifyBlindBoxToken(url.searchParams.get("t")!)).toEqual({ valid: true, sellerId: 3, version: 123456789 });
  });

  it("gives a seller with two or more live types one link per type", async () => {
    const seller = { id: 4, qr_version: 7 };
    state.rows = [
      { id: 20, active: true, seller, type: { archived: false } },
      { id: 21, active: true, seller, type: [{ archived: false }] },
      { id: 22, active: true, seller, type: { archived: true } }, // archived: not live
      { id: 30, active: true, seller: { id: 5, qr_version: 9 }, type: { archived: false } }, // one type: one link
    ];
    const res = await call({ ids: [20, 21, 30] });
    const { links } = (await res.json()) as { links: { id: number; url: string }[] };
    expect(links.map((l) => l.id)).toEqual([20, 21, 30]);
    expect(links[0].url).not.toBe(links[1].url);
    const tok = (i: number) => verifyBlindBoxToken(new URL(links[i].url).searchParams.get("t")!);
    expect(tok(0)).toEqual({ valid: true, sellerId: 4, version: 7, assignmentId: 20 });
    expect(tok(1)).toEqual({ valid: true, sellerId: 4, version: 7, assignmentId: 21 });
    expect(tok(2)).toEqual({ valid: true, sellerId: 5, version: 9 }); // unchanged seller-wide code
  });

  it("reports a database error", async () => {
    state.error = { message: "boom" };
    const res = await call({});
    expect(res.status).toBe(500);
  });
});
