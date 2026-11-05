/* Only the public guide is cached. Authenticated pages and writes are never stored. */
const SHELL = "vortexa-guide-shell-v6";
const DATA = "vortexa-guide-data-v1";
const ASSETS = ["/offline.html", "/offline.css", "/offline.js", "/offline-setup.js", "/campus-reference.webp", "/vortexa-logo-sm.webp", "/offline-fonts/outfit-latin.woff2", "/offline-fonts/alfa-slab-one-latin.woff2", "/offline-fonts/jetbrains-mono-latin.woff2"];
const SCHEDULE = "/api/offline-guide";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll(ASSETS.map((path) => new Request(path, { cache: "reload" })));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if ((key.startsWith("vortexa-guide-shell-") || key.startsWith("vortexa-guide-data-")) && key !== SHELL && key !== DATA) {
        await caches.delete(key);
      }
    }
    await self.clients.claim();
  })());
});

async function navigation(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if ([502, 503, 504].includes(response.status)) throw new Error("Unavailable");
    return response;
  } catch {
    const saved = await (await caches.open(SHELL)).match("/offline.html");
    if (!saved) return Response.error();
    const html = (await saved.text()).replace("<body>", '<body data-network-fallback>');
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  } finally {
    clearTimeout(timeout);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Never substitute HTML for API, auth callbacks, QR redemption or downloads.
  if (request.mode === "navigate" && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/auth/")) {
    if (!ASSETS.includes(url.pathname)) {
      event.respondWith(navigation(request));
      return;
    }
  }
  if (ASSETS.includes(url.pathname)) {
    event.respondWith((async () => (await (await caches.open(SHELL)).match(url.pathname)) || fetch(request))());
  } else if (url.pathname === SCHEDULE && !url.searchParams.has("refresh")) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(DATA);
          await cache.put(SCHEDULE, response.clone());
        }
        return response;
      } catch {
        return (await (await caches.open(DATA)).match(SCHEDULE)) || Response.error();
      }
    })());
  }
});
