/* Shared by the app and the standalone guide; stores public data only. */
(() => {
  const DATA = "vortexa-guide-data-v1";
  const SCHEDULE = "/api/offline-guide";
  const validSchedule = (value) => value && typeof value.savedAt === "string" &&
    Number.isFinite(Date.parse(value.savedAt)) && Array.isArray(value.items) && Array.isArray(value.days) &&
    value.items.every((item) => item && ["day_label", "title", "time_label", "location", "description"].every((key) => typeof item[key] === "string")) &&
    value.days.every((day) => day && typeof day.day_label === "string" && typeof day.day_date === "string");
  async function readSchedule() {
    try {
      const response = await (await caches.open(DATA)).match(SCHEDULE);
      const data = response ? await response.json() : null;
      return validSchedule(data) ? data : null;
    } catch { return null; }
  }
  async function updateSchedule(force = false) {
    const saved = await readSchedule();
    if (!force && saved && Date.now() - Date.parse(saved.savedAt) < 15 * 60 * 1000) return saved;
    // No fallback here: success must mean a new response, not an old cached copy.
    const response = await fetch(`${SCHEDULE}?refresh=1`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Schedule unavailable");
    const data = await response.json();
    if (!validSchedule(data)) throw new Error("Invalid schedule");
    await (await caches.open(DATA)).put(SCHEDULE, new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));
    return data;
  }
  const ready = (async () => {
    if (!("serviceWorker" in navigator) || !("caches" in window)) throw new Error("Offline storage unavailable");
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    const incoming = registration.installing || registration.waiting;
    if (incoming && incoming.state !== "activated") {
      await new Promise((resolve, reject) => {
        const changed = () => {
          if (incoming.state === "activated") { incoming.removeEventListener("statechange", changed); resolve(); }
          else if (incoming.state === "redundant") { incoming.removeEventListener("statechange", changed); reject(new Error("Guide update failed")); }
        };
        incoming.addEventListener("statechange", changed);
        changed();
      });
    }
    await navigator.serviceWorker.ready;
    const shell = await caches.open("vortexa-guide-shell-v6");
    for (const path of ["/offline.html", "/offline.css", "/offline.js", "/offline-setup.js", "/campus-reference.webp", "/vortexa-logo-sm.webp", "/offline-fonts/outfit-latin.woff2", "/offline-fonts/alfa-slab-one-latin.woff2", "/offline-fonts/jetbrains-mono-latin.woff2"]) {
      if (!(await shell.match(path))) throw new Error("Guide not saved");
    }
  })();
  window.vortexaOffline = { ready, readSchedule, updateSchedule };
  ready.then(() => updateSchedule()).catch(() => { /* The guide exposes missing data and recovery. */ });
})();
