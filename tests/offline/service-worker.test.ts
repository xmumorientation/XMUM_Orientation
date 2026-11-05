import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const listeners = new Map<string, (event: object) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const fetch = vi.fn(async (_request: unknown, _options?: unknown) => new Response("online"));
  const caches = {
    async open(name: string) {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return {
        async match(key: string) { return store.get(key)?.clone(); },
        async put(key: string, response: Response) { store.set(key, response); },
        async addAll(requests: Request[]) {
          for (const request of requests) store.set(new URL(request.url).pathname, new Response("<body>saved guide</body>"));
        },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(key: string) { return stores.delete(key); },
  };
  class LocalRequest extends Request {
    constructor(path: string, options: RequestInit) { super(new URL(path, "https://event.test"), options); }
  }
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: {
      location: { origin: "https://event.test" },
      addEventListener: (type: string, listener: (event: object) => void) => listeners.set(type, listener),
      skipWaiting: async () => {}, clients: { claim: async () => {} },
    },
    caches, fetch, Request: LocalRequest, Response, URL, AbortController, setTimeout, clearTimeout,
  });
  return {
    fetch, caches, stores,
    async install() {
      let pending = Promise.resolve();
      listeners.get("install")?.({ waitUntil: (value: Promise<void>) => { pending = value; } });
      await pending;
    },
    request(path: string, mode = "navigate", method = "GET") {
      let response: Promise<Response> | undefined;
      listeners.get("fetch")?.({
        request: { url: new URL(path, "https://event.test").href, method, mode },
        respondWith: (value: Promise<Response>) => { response = value; },
      });
      return response;
    },
  };
}

describe("offline guide boundary", () => {
  it("opens the saved guide after a failed navigation, and returns to the network on retry", async () => {
    const sw = worker();
    await sw.install();
    sw.fetch.mockRejectedValueOnce(new TypeError("offline"));
    expect(await (await sw.request("/gm"))?.text()).toBe("<body data-network-fallback>saved guide</body>");
    expect(await (await sw.request("/gm"))?.text()).toBe("online");
    expect(sw.stores.get("vortexa-guide-shell-v6")?.has("/gm")).toBe(false);
  });
  it("does not intercept writes, private reads, auth callbacks or external requests", () => {
    const sw = worker();
    expect(sw.request("/api/result", "cors", "POST")).toBeUndefined();
    expect(sw.request("/api/inventory", "cors")).toBeUndefined();
    expect(sw.request("/auth/callback?code=secret")).toBeUndefined();
    expect(sw.request("https://other.test/page")).toBeUndefined();
    expect(sw.request("/api/group-join")).toBeUndefined();
  });
  it("keeps a saved timetable when a network refresh fails; explicit refresh cannot report an old copy as new", async () => {
    const sw = worker();
    const data = await sw.caches.open("vortexa-guide-data-v1");
    await data.put("/api/offline-guide", new Response("old timetable"));
    sw.fetch.mockRejectedValueOnce(new TypeError("offline"));
    expect(await (await sw.request("/api/offline-guide", "cors"))?.text()).toBe("old timetable");
    expect(sw.request("/api/offline-guide?refresh=1", "cors")).toBeUndefined();
    sw.fetch.mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    expect((await sw.request("/api/offline-guide", "cors"))?.status).toBe(503);
    expect(await (await data.match("/api/offline-guide"))?.text()).toBe("old timetable");
  });
  it("does not turn authorization failures into offline pages", async () => {
    const sw = worker();
    sw.fetch.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));
    expect((await sw.request("/admin"))?.status).toBe(403);
  });
});
