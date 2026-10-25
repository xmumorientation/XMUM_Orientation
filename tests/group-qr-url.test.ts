import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("group QR link loading", () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("reuses a request for the same account and group", async () => {
    const fetcher = vi.fn(async () => Response.json({ urls: { 3: "https://example.test/join?g=three" } }));
    vi.stubGlobal("fetch", fetcher);
    const { groupQrUrl } = await import("../src/lib/group-qr-url");
    const [first, second] = await Promise.all([groupQrUrl("faci-a", 3), groupQrUrl("faci-a", 3)]);
    expect(first).toBe(second);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("/api/group-join", { cache: "no-store" });
  });

  it("refetches after account or group changes and after expiry", async () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fetcher = vi.fn(async () => Response.json({ urls: { 3: "three", 4: "four" } }));
    vi.stubGlobal("fetch", fetcher);
    const { groupQrUrl } = await import("../src/lib/group-qr-url");
    await groupQrUrl("faci-a", 3);
    await groupQrUrl("faci-b", 3);
    await groupQrUrl("faci-b", 4);
    now += 60_001;
    await groupQrUrl("faci-b", 4);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("does not cache a failed or unauthorized response", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ urls: { 3: "three" } }));
    vi.stubGlobal("fetch", fetcher);
    const { groupQrUrl } = await import("../src/lib/group-qr-url");
    await expect(groupQrUrl("faci-a", 3)).rejects.toThrow("unavailable");
    await expect(groupQrUrl("faci-a", 3)).resolves.toBe("three");
  });

  it("rejects malformed responses and links for other groups", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ urls: null }))
      .mockResolvedValueOnce(Response.json({ urls: { 4: "four" } }));
    vi.stubGlobal("fetch", fetcher);
    const { groupQrUrl } = await import("../src/lib/group-qr-url");
    await expect(groupQrUrl("faci-a", 3)).rejects.toThrow("Invalid");
    await expect(groupQrUrl("faci-a", 3)).rejects.toThrow("unavailable");
  });
});
