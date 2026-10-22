"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Camera, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { vxSlab } from "@/components/home/fonts";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";

import { avatarPathOf, FACI_PROFILE_SAVED_EVENT, type FaciProfile } from "./faciProfiles";

export function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

/**
 * A Faci's photo, or their initials on the group colour, in a holo ring.
 * The header avatar and the Facilitator cards both use this with the same
 * profile, so a new photo or name shows in both places at once.
 * `plain` drops the ring and glow for small sizes (the 40px header button),
 * where ring plus focus outline read as two stacked images.
 */
export function FaciAvatar({
  name,
  avatarUrl,
  size = 56,
  plain = false,
}: {
  name: string;
  avatarUrl: string | null;
  size?: number;
  plain?: boolean;
}) {
  return (
    <span
      className={`fh-faci-avatar${plain ? " fh-faci-avatar-plain" : ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {avatarUrl ? (
        <Image src={avatarUrl} alt="" width={160} height={160} />
      ) : (
        <span className="fh-slab">{initialsOf(name)}</span>
      )}
    </span>
  );
}

const NAME_MAX = 60;
const PROGRAMME_MAX = 80;
const INTRO_MAX = 160;
const LANGUAGES_MAX = 6;
const AVATAR_PX = 512;

/** Square-crops a photo to 512 px and encodes it as webp (jpeg where webp is not supported). */
async function resizeAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = AVATAR_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_PX,
    AVATAR_PX
  );
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.85));
  const blob = (await encode("image/webp")) ?? (await encode("image/jpeg"));
  if (!blob) throw new Error("encode failed");
  return blob;
}

const parseLanguages = (text: string) =>
  text
    .split(/[,，、]/)
    .map((l) => l.trim())
    .filter(Boolean);

/**
 * Bottom sheet where a Faci edits their profile. The name saves to
 * profiles.full_name (a user may update their own row); the rest saves through
 * fn_set_my_faci_profile. The photo is resized on the phone and uploaded to
 * faci-avatars/<user id>/ when the Faci taps Save.
 */
export function ProfileEditor({
  open,
  onClose,
  me,
  userId,
  themeVars,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  me: FaciProfile;
  userId: string;
  themeVars: React.CSSProperties;
  onSaved: (name: string) => void;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(me.name);
  const [instagram, setInstagram] = useState(me.instagram ?? "");
  const [programme, setProgramme] = useState(me.programme);
  const [languages, setLanguages] = useState(me.languages.join(", "));
  const [intro, setIntro] = useState(me.intro);
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from the current profile each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setName(me.name);
    setInstagram(me.instagram ?? "");
    setProgramme(me.programme);
    setLanguages(me.languages.join(", "));
    setIntro(me.intro);
    setPhoto(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.preview); }, [photo]);

  const trimmed = name.trim();
  const handle = instagram.trim().replace(/^@+/, "");
  const langList = parseLanguages(languages);
  const handleOk = handle === "" || /^[A-Za-z0-9._]{1,30}$/.test(handle);
  const langOk = langList.length <= LANGUAGES_MAX;
  const changed =
    trimmed !== me.name ||
    handle !== (me.instagram ?? "") ||
    programme.trim() !== me.programme ||
    langList.join("|") !== me.languages.join("|") ||
    intro.trim() !== me.intro ||
    photo !== null;

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      const blob = await resizeAvatar(file);
      setPhoto({ blob, preview: URL.createObjectURL(blob) });
    } catch {
      setError("That photo could not be read. Try a JPG or PNG.");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || !changed || !handleOk || !langOk) return;
    setSaving(true);
    setError(null);

    const oldPath = avatarPathOf(me.avatarUrl);
    let avatarPath = oldPath;
    if (photo) {
      const ext = photo.blob.type === "image/jpeg" ? "jpg" : "webp";
      // A new file name each time, so the old photo is not served from cache.
      const path = `${userId}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from("faci-avatars").upload(path, photo.blob, { contentType: photo.blob.type });
      if (up.error) {
        setSaving(false);
        return setError(friendlyError(up.error));
      }
      avatarPath = path;
    }

    if (trimmed !== me.name) {
      const { error: err } = await supabase.from("profiles").update({ full_name: trimmed }).eq("id", userId);
      if (err) {
        setSaving(false);
        return setError(friendlyError(err));
      }
    }
    const { error: rpcErr } = await supabase.rpc("fn_set_my_faci_profile", {
      p_instagram: handle,
      p_programme: programme.trim(),
      p_languages: langList,
      p_intro: intro.trim(),
      p_avatar_path: avatarPath,
    });
    setSaving(false);
    if (rpcErr) return setError(friendlyError(rpcErr));

    // Best effort: the replaced photo is no longer used.
    if (photo && oldPath && oldPath !== avatarPath) void supabase.storage.from("faci-avatars").remove([oldPath]);
    window.dispatchEvent(new Event(FACI_PROFILE_SAVED_EVENT));
    onSaved(trimmed);
    // Server-rendered profile (menu drawer, other pages) picks up the new name.
    router.refresh();
    onClose();
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fi-overlay" />
        <Dialog.Content className={`fh fi-sheet fh-edit ${vxSlab.variable}`} style={themeVars} aria-describedby={undefined}>
          <span className="fi-grab" aria-hidden />
          <Dialog.Title className="fi-sheet-title fh-slab">Edit Profile</Dialog.Title>
          <p className="fi-sheet-sub">This is what your partner and your group see.</p>
          <Dialog.Close className="fi-x" aria-label="Close">
            <X size={16} />
          </Dialog.Close>

          <form onSubmit={save} className="fh-edit-form">
            <div className="fh-edit-photo">
              <FaciAvatar name={trimmed || me.name} avatarUrl={photo?.preview ?? me.avatarUrl} size={72} />
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="fh-edit-file"
                onChange={pickPhoto}
                tabIndex={-1}
              />
              <button type="button" className="fh-edit-photobtn" onClick={() => fileRef.current?.click()}>
                <Camera size={16} aria-hidden /> {me.avatarUrl || photo ? "Change Photo" : "Add Photo"}
              </button>
            </div>

            <label className="fh-edit-field">
              <span>Name</span>
              <input
                className="fh-input"
                required
                maxLength={NAME_MAX}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </label>

            <label className="fh-edit-field">
              <span>Instagram</span>
              <span className="fh-edit-at">
                <i aria-hidden>@</i>
                <input
                  className="fh-input"
                  placeholder="your.handle"
                  maxLength={31}
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  aria-invalid={!handleOk}
                />
              </span>
              {!handleOk && <small className="fh-check-msg">Letters, numbers, . and _ only (30 max).</small>}
            </label>
            <label className="fh-edit-field">
              <span>Programme</span>
              <input
                className="fh-input"
                placeholder="e.g. Computer Science / Year 3"
                maxLength={PROGRAMME_MAX}
                value={programme}
                onChange={(e) => setProgramme(e.target.value)}
              />
            </label>
            <label className="fh-edit-field">
              <span>Languages</span>
              <input
                className="fh-input"
                placeholder="e.g. English, 中文"
                value={languages}
                onChange={(e) => setLanguages(e.target.value)}
                aria-invalid={!langOk}
              />
              {!langOk && <small className="fh-check-msg">Up to {LANGUAGES_MAX} languages, separated by commas.</small>}
            </label>
            <label className="fh-edit-field">
              <span>Intro</span>
              <textarea
                className="fh-input"
                rows={3}
                maxLength={INTRO_MAX}
                placeholder="A line or two to your group"
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
              />
            </label>

            <button type="submit" className="fh-btn fh-btn-primary fh-btn-block" disabled={!trimmed || !changed || !handleOk || !langOk || saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            {error && (
              <small className="fh-check-msg" role="alert">
                {error}
              </small>
            )}
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
