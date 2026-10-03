// Shared Freshie login for one group. The Freshie types 4 digits. Auth stores
// a longer password because Supabase rejects short ones. The extra prefix
// never appears on screen or in the scan link.

const PASSWORD_PREFIX = "vxum";

export function groupLoginEmail(groupId: number): string {
  return `group-${groupId}@freshie.xmu.edu.my`;
}

export function groupLoginPassword(code: string): string {
  return `${PASSWORD_PREFIX}${code}`;
}

export function groupJoinPath(groupId: number, code: string): string {
  return `/join?group${groupId}=${code}`;
}

/** First `group{id}={4 digits}` query pair, e.g. ?group1=1234. */
export function parseGroupJoin(params: URLSearchParams): { groupId: number; code: string } | null {
  for (const [key, value] of params.entries()) {
    const match = /^group(\d+)$/.exec(key);
    if (match && /^\d{4}$/.test(value)) {
      return { groupId: Number(match[1]), code: value };
    }
  }
  return null;
}
