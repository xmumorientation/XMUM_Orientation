import type { SupabaseClient } from "@supabase/supabase-js";

import type { UserRole } from "./types";

/** Files (PDF or image) that HOF, OC, HOGM and Admin put on the Home page of the
 *  roles they pick (migration 0117). Managed in Admin → Settings → Home Sections
 *  and in Ops → Home Sections; shown by components/HomeSections.tsx. */
export type HomeSectionKind = "image" | "pdf";

export type HomeSection = {
  id: string;
  title: string;
  /** Object in the private home-files bucket. Null for a seeded static file. */
  storage_path: string | null;
  /** Static file under public/ (the seeded action plans). Null for an upload. */
  file_url: string | null;
  file_kind: HomeSectionKind;
  roles: UserRole[];
  sort_order: number;
  created_at: string;
};

/** A section with a URL the browser can open now. */
export type ResolvedHomeSection = HomeSection & { url: string };

/** Who a section is for, as the editor offers it. The database keeps the individual roles. */
export type HomeAudience = "freshie" | "faci" | "gm" | "committee";

export const HOME_AUDIENCES: readonly { key: HomeAudience; label: string; roles: UserRole[] }[] = [
  { key: "freshie", label: "Freshies", roles: ["freshie"] },
  { key: "faci", label: "Facilitators", roles: ["faci"] },
  { key: "gm", label: "Game Masters", roles: ["gm", "guardian_gm"] },
  { key: "committee", label: "Committee", roles: ["committee", "hof", "oc", "hogm", "admin"] },
];

/** The groups a section's roles fall in. */
export function audiencesOf(roles: readonly UserRole[]): HomeAudience[] {
  return HOME_AUDIENCES.filter((a) => a.roles.some((r) => roles.includes(r))).map((a) => a.key);
}

/** Every role in the chosen groups. */
export function rolesOf(audiences: readonly HomeAudience[]): UserRole[] {
  return HOME_AUDIENCES.filter((a) => audiences.includes(a.key)).flatMap((a) => a.roles);
}

export const HOME_FILE_BUCKET = "home-files";
export const HOME_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const HOME_FILE_ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,image/gif";
const ACCEPTED = new Set(HOME_FILE_ACCEPT.split(","));
/** Signed links last this long; Home asks for fresh ones whenever the tab comes back. */
const SIGNED_URL_SECONDS = 4 * 60 * 60;

/** What kind of file this is, or why it cannot be used. */
export function checkHomeFile(file: Pick<File, "type" | "size">): { kind: HomeSectionKind } | { error: string } {
  if (!ACCEPTED.has(file.type)) return { error: "Use a PDF, PNG, JPG, WebP or GIF file." };
  if (file.size > HOME_FILE_MAX_BYTES) return { error: "That file is over 10 MB. Use a smaller one." };
  return { kind: file.type === "application/pdf" ? "pdf" : "image" };
}

/** A storage path that is unique and keeps a readable extension. */
export function homeFilePath(file: Pick<File, "type">): string {
  const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/jpeg" ? "jpg" : file.type.replace("image/", "");
  return `${crypto.randomUUID()}.${ext}`;
}

export function sortHomeSections<T extends Pick<HomeSection, "sort_order" | "created_at">>(list: T[]): T[] {
  return [...list].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

export function sectionsForRole(list: HomeSection[], role: UserRole): HomeSection[] {
  return sortHomeSections(list.filter((s) => s.roles.includes(role)));
}

/** Add a link to each section. A section whose link cannot be made is left out. */
export async function resolveHomeSections(supabase: SupabaseClient, list: HomeSection[]): Promise<ResolvedHomeSection[]> {
  const paths = list.flatMap((s) => (s.storage_path ? [s.storage_path] : []));
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await supabase.storage.from(HOME_FILE_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    for (const row of data ?? []) if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
  }
  return list.flatMap((s) => {
    const url = s.storage_path ? signed.get(s.storage_path) : s.file_url;
    return url ? [{ ...s, url }] : [];
  });
}
