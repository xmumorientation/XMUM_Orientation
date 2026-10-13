// ─────────────────────────────────────────────────────────────────────────────
// Facilitator cards on Freshie Home.
// - A Faci's "You & Your Partner" lists the real Facis of their group (Admin
//   assigns them in Freshie Control; see useGroupFacis in FreshieHome). Only
//   the name is stored today, so the other fields stay empty.
// - A Freshie's "Your Facilitator" calls fn_group_facis() (Freshies cannot read
//   other profiles under RLS). Until the backend adds it, the call fails with
//   "function not found" and the page falls back to the SAMPLE profiles below.
// TODO(backend): profile fields (photo, Instagram, programme,
// languages, intro) and a way for a Faci to edit them.
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

export const SAMPLE_FACIS: FaciProfile[] = [
  {
    id: "sample-faci-1",
    name: "Mei Lin Tan",
    avatarUrl: null,
    instagram: "meilin.sample",
    programme: "Computer Science · Year 3",
    languages: ["English", "中文", "Bahasa Melayu"],
    intro: "Lost on campus or need help finding a station? Come find me.",
  },
  {
    id: "sample-faci-2",
    name: "Arjun Kumar",
    avatarUrl: null,
    instagram: "arjun.sample",
    programme: "Finance · Year 2",
    languages: ["English", "Bahasa Melayu", "Tamil"],
    intro: "I'll keep our group moving and on time. Ask me anything.",
  },
];

/** A real Faci from profiles. Only the name is stored, so the rest is empty. */
export function faciFromProfile(
  row: { id: string; full_name: string; instagram?: string | null },
  meId: string
): FaciProfile {
  return {
    id: row.id,
    name: row.full_name.trim() || "Facilitator",
    avatarUrl: null,
    instagram: row.instagram?.trim() || null,
    programme: "",
    languages: [],
    intro: "",
    isMe: row.id === meId,
  };
}

/** Sample Facilitators for a Freshie's group (the same two for every group for now). */
export function faciProfilesFor(groupId: number | null): FaciProfile[] {
  void groupId;
  return SAMPLE_FACIS;
}
