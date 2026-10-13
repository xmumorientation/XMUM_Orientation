// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE DATA ONLY: not real facilitators.
// Freshie Home's "Your Facilitator" stop shows these made-up profiles until
// Facilitators can build their own profile (photo, Instagram, ...).
// TODO(backend): read the group's Faci profiles (profiles.role = 'faci' and
// group_id = the Freshie's group) once the profile fields exist.
// ─────────────────────────────────────────────────────────────────────────────

export type FaciProfile = {
  id: string;
  name: string;
  /** Photo URL. Null shows the initials instead. */
  avatarUrl: string | null;
  /** Instagram handle without the @. Null hides the button. */
  instagram: string | null;
  /** WhatsApp number with country code, digits only (for wa.me links). Null hides the button. */
  whatsapp: string | null;
  /** e.g. "Computer Science · Year 3" */
  programme: string;
  languages: string[];
  /** One or two lines in the Faci's own words. */
  intro: string;
};

export const SAMPLE_FACIS: FaciProfile[] = [
  {
    id: "sample-faci-1",
    name: "Mei Lin Tan",
    avatarUrl: null,
    instagram: "meilin.sample",
    whatsapp: "60120000001",
    programme: "Computer Science · Year 3",
    languages: ["English", "中文", "Bahasa Melayu"],
    intro: "Lost on campus or need help finding a station? Come find me.",
  },
  {
    id: "sample-faci-2",
    name: "Arjun Kumar",
    avatarUrl: null,
    instagram: "arjun.sample",
    whatsapp: "60120000002",
    programme: "Finance · Year 2",
    languages: ["English", "Bahasa Melayu", "Tamil"],
    intro: "I'll keep our group moving and on time. Ask me anything.",
  },
];

/** The Facilitators of a group. Sample data for every group for now. */
export function faciProfilesFor(groupId: number | null): FaciProfile[] {
  void groupId;
  return SAMPLE_FACIS;
}
