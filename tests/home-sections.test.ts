import { describe, expect, it } from "vitest";

import {
  checkHomeFile,
  HOME_FILE_MAX_BYTES,
  audiencesOf,
  resolveHomeSections,
  rolesOf,
  sectionsForRole,
  type HomeSection,
} from "@/lib/homeSections";

const section = (over: Partial<HomeSection>): HomeSection => ({
  id: "1", title: "T", storage_path: null, file_url: "/a.png", file_kind: "image",
  roles: ["faci"], sort_order: 0, created_at: "2026-11-01T00:00:00Z", ...over,
});

describe("checkHomeFile", () => {
  it("accepts a PDF and images, and says which", () => {
    expect(checkHomeFile({ type: "application/pdf", size: 10 })).toEqual({ kind: "pdf" });
    for (const type of ["image/png", "image/jpeg", "image/webp", "image/gif"]) expect(checkHomeFile({ type, size: 10 })).toEqual({ kind: "image" });
  });
  it("refuses other types and anything over 10 MB", () => {
    expect(checkHomeFile({ type: "application/msword", size: 10 })).toHaveProperty("error");
    expect(checkHomeFile({ type: "image/svg+xml", size: 10 })).toHaveProperty("error");
    expect(checkHomeFile({ type: "application/pdf", size: HOME_FILE_MAX_BYTES + 1 })).toHaveProperty("error");
    expect(checkHomeFile({ type: "application/pdf", size: HOME_FILE_MAX_BYTES })).toEqual({ kind: "pdf" });
  });
});

describe("sectionsForRole", () => {
  it("keeps only the sections that list the role, in order", () => {
    const list = [
      section({ id: "c", roles: ["faci"], sort_order: 2 }),
      section({ id: "x", roles: ["freshie"], sort_order: 0 }),
      section({ id: "b", roles: ["faci", "gm"], sort_order: 1, created_at: "2026-11-02T00:00:00Z" }),
      section({ id: "a", roles: ["faci"], sort_order: 1, created_at: "2026-11-01T00:00:00Z" }),
    ];
    expect(sectionsForRole(list, "faci").map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(sectionsForRole(list, "freshie").map((s) => s.id)).toEqual(["x"]);
    expect(sectionsForRole(list, "hof")).toEqual([]);
  });
});

describe("resolveHomeSections", () => {
  const fake = (signed: Record<string, string>) => {
    const calls: string[][] = [];
    return {
      calls,
      client: {
        storage: { from: () => ({ createSignedUrls: async (paths: string[]) => { calls.push(paths); return { data: paths.filter((p) => signed[p]).map((p) => ({ path: p, signedUrl: signed[p] })) }; } }) },
      } as never,
    };
  };
  it("signs uploads in one call, keeps static files, and drops a file it cannot link", async () => {
    const { client, calls } = fake({ "u1.pdf": "https://s/u1" });
    const out = await resolveHomeSections(client, [
      section({ id: "s", storage_path: null, file_url: "/action-plans/day-1.png" }),
      section({ id: "u", storage_path: "u1.pdf", file_url: null, file_kind: "pdf" }),
      section({ id: "gone", storage_path: "missing.pdf", file_url: null, file_kind: "pdf" }),
    ]);
    expect(calls).toEqual([["u1.pdf", "missing.pdf"]]);
    expect(out.map((s) => [s.id, s.url])).toEqual([["s", "/action-plans/day-1.png"], ["u", "https://s/u1"]]);
  });
  it("makes no storage call when every file is static", async () => {
    const { client, calls } = fake({});
    await resolveHomeSections(client, [section({})]);
    expect(calls).toEqual([]);
  });
});

describe("audiences", () => {
  it("Committee covers Committee, HOF, OC, HOGM and Admin; Game Masters cover Guardian GM", () => {
    expect(rolesOf(["committee"]).sort()).toEqual(["admin", "committee", "hof", "hogm", "oc"]);
    expect(rolesOf(["gm"]).sort()).toEqual(["gm", "guardian_gm"]);
    expect(rolesOf(["freshie", "faci"])).toEqual(["freshie", "faci"]);
    expect(rolesOf([])).toEqual([]);
  });
  it("turns roles back into groups, so a seeded section round-trips", () => {
    const seeded = ["faci", "gm", "guardian_gm", "hof", "oc", "hogm", "committee", "admin"] as const;
    expect(audiencesOf(seeded)).toEqual(["faci", "gm", "committee"]);
    expect(rolesOf(audiencesOf(seeded)).sort()).toEqual([...seeded].sort());
    expect(audiencesOf(["hof"])).toEqual(["committee"]);
    expect(audiencesOf(["freshie"])).toEqual(["freshie"]);
  });
});
