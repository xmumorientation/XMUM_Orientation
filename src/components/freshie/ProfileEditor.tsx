"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Camera, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { vxSlab } from "@/components/home/fonts";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";

import type { FaciProfile } from "./faciProfiles";

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

/**
 * Bottom sheet where a Faci edits their profile. Only the name saves today
 * (profiles.full_name, which a user may update on their own row). Photo,
 * Instagram, programme, languages and intro wait for the profile backend
 * (see docs/ROADMAP.md), so they show but cannot be changed yet.
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
  const [name, setName] = useState(me.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from the current profile each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setName(me.name);
    setError(null);
  }, [open, me.name]);

  const trimmed = name.trim();
  const changed = trimmed !== me.name;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || !changed) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("profiles").update({ full_name: trimmed }).eq("id", userId);
    setSaving(false);
    if (err) return setError(friendlyError(err));
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
              <FaciAvatar name={trimmed || me.name} avatarUrl={me.avatarUrl} size={72} />
              <button type="button" className="fh-edit-soonbtn" disabled>
                <Camera size={16} aria-hidden /> Change Photo
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

            <fieldset className="fh-edit-soon" disabled>
              <legend>
                <span className="fh-edit-soontag fh-mono">Soon</span>
                These save once profiles go live.
              </legend>
              <label className="fh-edit-field">
                <span>Instagram</span>
                <span className="fh-edit-at">
                  <i aria-hidden>@</i>
                  <input className="fh-input" placeholder="your.handle" defaultValue={me.instagram ?? ""} />
                </span>
              </label>
              <label className="fh-edit-field">
                <span>Programme</span>
                <input className="fh-input" placeholder="e.g. Computer Science · Year 3" defaultValue={me.programme} />
              </label>
              <label className="fh-edit-field">
                <span>Languages</span>
                <input className="fh-input" placeholder="e.g. English, 中文" defaultValue={me.languages.join(", ")} />
              </label>
              <label className="fh-edit-field">
                <span>Intro</span>
                <textarea className="fh-input" rows={3} maxLength={160} placeholder="A line or two to your group" defaultValue={me.intro} />
              </label>
            </fieldset>

            <button type="submit" className="fh-btn fh-btn-primary fh-btn-block" disabled={!trimmed || !changed || saving}>
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
