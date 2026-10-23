// Only the stable join link is cached, never the group's changeable password.
// Keep this in memory, scoped to the signed-in account and its current group.
let cached: { key: string; until: number; request: Promise<string> } | null = null;

export function groupQrUrl(userId: string, groupId: number): Promise<string> {
  const key = JSON.stringify([userId, groupId]);
  if (cached?.key === key && cached.until > Date.now()) return cached.request;
  const request = loadGroupQrUrl(groupId).catch((error: unknown) => {
    if (cached?.request === request) cached = null;
    throw error;
  });
  cached = { key, until: Date.now() + 60_000, request };
  return request;
}

async function loadGroupQrUrl(groupId: number): Promise<string> {
  const response = await fetch("/api/group-join", { cache: "no-store" });
  if (!response.ok) throw new Error("Group QR unavailable");
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("urls" in body) ||
      typeof body.urls !== "object" || body.urls === null) throw new Error("Invalid group QR response");
  const url: unknown = Object.entries(body.urls).find(([id]) => id === String(groupId))?.[1];
  if (typeof url !== "string" || !url) throw new Error("Group QR unavailable");
  return url;
}
