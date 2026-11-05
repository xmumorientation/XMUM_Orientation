(() => {
  const connection = document.getElementById("connection");
  const retry = document.getElementById("retry");
  const refresh = document.getElementById("refresh");
  const readiness = document.getElementById("readiness");
  // A guide update may replace all its files; reload this read-only page only.
  // The main app (including any open GM queue) is never reloaded here.
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
  }
  let chosenDay = null;
  function setButtonLabel(button, label) { button.querySelector("span").textContent = label; }
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("icon");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#i-${name}`);
    svg.append(use);
    return svg;
  }
  let fallback = document.body.hasAttribute("data-network-fallback");
  let wasOffline = !navigator.onLine;
  function connectionStatus() {
    const offline = !navigator.onLine;
    document.getElementById("guide-title").textContent = offline ? "You’re Offline" : fallback ? "Connection Lost" : wasOffline ? "Connection Detected" : "Offline Guide";
    connection.textContent = offline ? "You have no internet connection."
      : fallback ? "Can’t reach Vortexa. Try again or use your saved essentials."
      : wasOffline ? "Try again to return to Vortexa."
      : "No internet? Your saved schedule and map are here.";
    document.getElementById("connection-icon").setAttribute("href", offline || fallback ? "#i-wifi-off" : "#i-wifi");
    document.body.dataset.offline = String(offline || fallback);
    if (offline) wasOffline = true;
  }
  connectionStatus();
  window.addEventListener("online", () => { fallback = false; connectionStatus(); });
  window.addEventListener("offline", connectionStatus);
  retry.addEventListener("click", () => {
    setButtonLabel(retry, "Trying Again…");
    if (location.pathname === "/offline.html") location.assign("/");
    else location.reload();
  });
  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }
  async function renderSchedule() {
    const data = await window.vortexaOffline.readSchedule();
    if (!data) return;
    const formatted = new Date(data.savedAt).toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" });
    document.getElementById("saved-time").textContent = `Saved ${formatted} MYT. May have changed`;
    const content = document.getElementById("schedule-content");
    content.replaceChildren();
    const labels = [...new Set([...data.days.map((day) => day.day_label), ...data.items.map((item) => item.day_label)])];
    if (!data.items.length) content.append(element("p", "No activities published yet."));
    if (!labels.length) return;
    if (!labels.includes(chosenDay)) chosenDay = labels[0];
    const picker = element("div", "");
    picker.className = "day-picker";
    picker.setAttribute("role", "group");
    picker.setAttribute("aria-label", "Schedule day");
    const list = document.createElement("ol");
    list.className = "timeline";
    list.id = "day-schedule";
    const categories = {
      INFO: { icon: "info", color: "var(--vx-cyan)" },
      CEREMONY: { icon: "star", color: "var(--vx-yellow)" },
      GAME: { icon: "game", color: "var(--vx-pink)" },
      FOOD: { icon: "food", color: "var(--vx-orange)" },
    };
    function showDay(label) {
      chosenDay = label;
      for (const button of picker.children) button.setAttribute("aria-pressed", String(button.dataset.day === label));
      list.setAttribute("aria-label", `${label} saved schedule`);
      list.replaceChildren();
      for (const item of data.items.filter((entry) => entry.day_label === label)) {
        const row = document.createElement("li");
        row.append(element("strong", item.title));
        const when = element("p", "");
        when.className = "when";
        when.append(element("time", item.time_label || "Time TBA"));
        if (item.location) when.append(document.createTextNode(`, ${item.location.toUpperCase() === "TBD" ? "Venue TBA" : item.location}`));
        row.append(when);
        const key = item.description.trim().toUpperCase();
        const category = Object.hasOwn(categories, key) ? categories[key] : null;
        if (category) {
          row.style.setProperty("--dot", category.color);
          const tag = element("span", "");
          tag.className = "category";
          tag.append(icon(category.icon), document.createTextNode(key));
          row.append(tag);
        } else if (item.description) {
          const note = element("p", item.description);
          note.className = "item-note";
          row.append(note);
        }
        list.append(row);
      }
      if (!list.children.length) list.append(element("li", "No activities published for this day."));
    }
    for (const label of labels) {
      const button = element("button", "");
      button.type = "button";
      button.dataset.day = label;
      button.setAttribute("aria-controls", "day-schedule");
      button.append(element("b", label));
      const date = data.days.find((day) => day.day_label === label)?.day_date;
      if (date && Number.isFinite(Date.parse(`${date}T00:00:00+08:00`))) {
        button.append(element("small", new Date(`${date}T00:00:00+08:00`).toLocaleDateString("en-GB", { timeZone: "Asia/Kuala_Lumpur", weekday: "short", day: "numeric", month: "short" }).toUpperCase()));
      }
      button.addEventListener("click", () => showDay(label));
      picker.append(button);
    }
    content.append(picker, list);
    showDay(chosenDay);
  }

  refresh.addEventListener("click", async () => {
    refresh.disabled = true;
    setButtonLabel(refresh, "Updating…");
    try {
      await window.vortexaOffline.updateSchedule(true);
      await renderSchedule();
      document.getElementById("update-status").textContent = "Saved.";
    } catch {
      document.getElementById("update-status").textContent = (await window.vortexaOffline.readSchedule()) ? "Couldn’t update. Showing your saved copy." : "Couldn’t update. Check your connection.";
    } finally {
      refresh.disabled = false;
      setButtonLabel(refresh, "Update");
    }
  });
  const links = [...document.querySelectorAll(".guide-nav a")];
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!visible) return;
      for (const link of links) {
        if (link.hash === `#${visible.target.id}`) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
    }, { rootMargin: "-100px 0px -45% 0px", threshold: 0 });
    document.querySelectorAll(".guide-section").forEach((section) => observer.observe(section));
  }
  void renderSchedule();
  window.vortexaOffline.ready.then(async () => {
    readiness.textContent = "Guide and map saved.";
    try { await window.vortexaOffline.updateSchedule(); } catch { /* Keep the last good copy. */ }
    await renderSchedule();
  }).catch(() => {
    readiness.textContent = "Files not saved. Reconnect to prepare this guide.";
  });
})();
