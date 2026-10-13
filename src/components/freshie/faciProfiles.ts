// ─────────────────────────────────────────────────────────────────────────────
// Facilitator cards on Freshie Home.
// Both a Faci's "You & Your Partner" and a Freshie's "Your Facilitator" read
// fn_group_facis() (migration 0069): the real Facis of the caller's group with
// their profile fields. A Faci edits their own through fn_set_my_faci_profile.
// ─────────────────────────────────────────────────────────────────────────────

export type FaciProfile = {
  id: string;
  name: string;
  /** Photo URL. Null shows the initials instead. */
  avatarUrl: string | null;
  /** Instagram handle without the @. Null shows a greyed, inactive Instagram chip. */
  instagram: string | null;
  /** e.g. "Computer Science · Year 3". Empty when not filled in. */
  programme: string;
  languages: string[];
  /** One or two lines in the Faci's own words. Empty when not filled in. */
  intro: string;
  /** The signed-in Faci's own card (shows YOU and the edit pencil). */
  isMe?: boolean;
};

/** One row of fn_group_facis(). */
export type FaciRow = {
  id: string;
  full_name: string;
  instagram?: string | null;
  programme?: string | null;
  languages?: string[] | null;
  intro?: string | null;
  /** Path relative to the Supabase project URL, or null. */
  avatar_url?: string | null;
};

const AVATAR_PREFIX = "/storage/v1/object/public/faci-avatars/";

/** The Supabase project's storage host, for next/image (see next.config). */
function supabaseUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
}

/** Storage path (<user id>/<file>) inside faci-avatars, from an avatar URL. */
export function avatarPathOf(url: string | null): string | null {
  const i = url ? url.indexOf(AVATAR_PREFIX) : -1;
  return url && i >= 0 ? url.slice(i + AVATAR_PREFIX.length).split("?")[0] : null;
}

/** Public URL of a faci-avatars path. */
export function avatarUrlOf(path: string): string {
  return `${supabaseUrl()}${AVATAR_PREFIX}${path}`;
}

/** A real Faci from fn_group_facis() (or just id and name before it loads). */
export function faciFromProfile(row: FaciRow, meId: string): FaciProfile {
  return {
    id: row.id,
    name: row.full_name.trim() || "Facilitator",
    avatarUrl: row.avatar_url ? `${supabaseUrl()}${row.avatar_url}` : null,
    instagram: row.instagram?.trim() || null,
    programme: row.programme?.trim() ?? "",
    languages: row.languages ?? [],
    intro: row.intro?.trim() ?? "",
    isMe: row.id === meId,
  };
}
