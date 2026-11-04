"use client";

import { ExternalLink, FileText, FileUp, Image as ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  audiencesOf,
  checkHomeFile,
  HOME_FILE_ACCEPT,
  HOME_FILE_BUCKET,
  HOME_AUDIENCES,
  homeFilePath,
  type HomeAudience,
  resolveHomeSections,
  rolesOf,
  sortHomeSections,
  type HomeSection,
  type ResolvedHomeSection,
} from "@/lib/homeSections";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";

import { ConfirmSheet, Sheet, StatusLine, useStatus } from "./game/parts";

import "./game/game-control.css";

// Settings → Home Sections. HOF, OC, HOGM and Admin add, change and remove the
// files (PDF or image) shown on Home to the groups they pick (Freshies, Facilitators,
// Game Masters, Committee; stored as the roles in each), including the Day 1
// and Day 2 action plans. One component for Admin → Settings and for Ops
// (migration 0117 lets only those four write). Files go to the private
// home-files bucket and are opened through signed links.

type Form = { id: string | null; title: string; audiences: HomeAudience[]; file: File | null };
const emptyForm: Form = { id: null, title: "", audiences: [], file: null };

const audienceLabels = (s: Pick<HomeSection, "roles">) =>
  HOME_AUDIENCES.filter((a) => audiencesOf(s.roles).includes(a.key)).map((a) => a.label).join(", ");

export function HomeSectionsManager() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { error, setError, notice, flash } = useStatus();
  const [sections, setSections] = useState<ResolvedHomeSection[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ResolvedHomeSection | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from("home_sections").select("*");
    if (err) return setError(friendlyError(err));
    setSections(await resolveHomeSections(supabase, sortHomeSections((data as HomeSection[]) ?? [])));
  }, [supabase, setError]);

  useEffect(() => {
    load();
  }, [load]);

  const editing = form?.id ? sections?.find((s) => s.id === form.id) : undefined;

  function openAdd() {
    setFormError(null);
    setForm(emptyForm);
  }

  function openEdit(s: ResolvedHomeSection) {
    setFormError(null);
    setForm({ id: s.id, title: s.title, audiences: audiencesOf(s.roles), file: null });
  }

  function pickFile(file: File | undefined) {
    if (!file) return;
    const checked = checkHomeFile(file);
    if ("error" in checked) return setFormError(checked.error);
    setFormError(null);
    setForm((f) => (f ? { ...f, file } : f));
  }

  function toggleAudience(key: HomeAudience) {
    setForm((f) => (f ? { ...f, audiences: f.audiences.includes(key) ? f.audiences.filter((a) => a !== key) : [...f.audiences, key] } : f));
  }

  async function removeObject(path: string | null) {
    if (path) await supabase.storage.from(HOME_FILE_BUCKET).remove([path]);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const title = form.title.trim();
    if (!title) return setFormError("Enter a title.");
    if (form.audiences.length === 0) return setFormError("Pick who sees it.");
    if (!form.id && !form.file) return setFormError("Choose a file.");

    setBusy(true);
    setFormError(null);
    const roles = rolesOf(form.audiences);

    // Upload first, so a section never points at a file that is not there.
    let uploaded: { path: string; kind: "image" | "pdf" } | null = null;
    if (form.file) {
      const checked = checkHomeFile(form.file);
      if ("error" in checked) {
        setBusy(false);
        return setFormError(checked.error);
      }
      const path = homeFilePath(form.file);
      const { error: upErr } = await supabase.storage.from(HOME_FILE_BUCKET).upload(path, form.file, { contentType: form.file.type, cacheControl: "3600" });
      if (upErr) {
        setBusy(false);
        return setFormError(friendlyError(upErr));
      }
      uploaded = { path, kind: checked.kind };
    }

    const fileFields = uploaded ? { storage_path: uploaded.path, file_url: null, file_kind: uploaded.kind } : {};
    const { error: dbErr } = form.id
      ? await supabase.from("home_sections").update({ title, roles, ...fileFields }).eq("id", form.id)
      : await supabase.from("home_sections").insert({
          title,
          roles,
          ...fileFields,
          sort_order: Math.max(-1, ...(sections ?? []).map((s) => s.sort_order)) + 1,
        });

    if (dbErr) {
      await removeObject(uploaded?.path ?? null);
      setBusy(false);
      return setFormError(friendlyError(dbErr));
    }
    if (uploaded) await removeObject(editing?.storage_path ?? null);
    setBusy(false);
    setForm(null);
    flash(form.id ? "Section saved" : "Section added");
    load();
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    const { error: dbErr } = await supabase.from("home_sections").delete().eq("id", removing.id);
    if (dbErr) {
      setBusy(false);
      setRemoving(null);
      return setError(friendlyError(dbErr));
    }
    await removeObject(removing.storage_path);
    setBusy(false);
    setRemoving(null);
    flash("Section removed");
    load();
  }

  return (
    <div className="gc hsm">
      <div className="gc-stack">
        <div className="hsm-bar">
          <p className="gc-muted">Files shown on Home to the roles you pick. PDF or image, up to 10 MB.</p>
          <button type="button" className="gc-btn gc-btn-primary" onClick={openAdd}>
            <Plus size={16} aria-hidden /> Add Section
          </button>
        </div>
        <StatusLine error={error} notice={notice} />

        <div className="gc-card">
          {sections === null ? (
            <p className="gc-empty">Loading…</p>
          ) : sections.length === 0 ? (
            <p className="gc-empty">No sections yet. Add one to show a file on Home.</p>
          ) : (
            <ul className="gc-ops-rows">
              {sections.map((s) => {
                const Icon = s.file_kind === "pdf" ? FileText : ImageIcon;
                return (
                  <li key={s.id} className="gc-ops-row gc-ops-top">
                    <Icon size={20} className="hsm-ic" aria-hidden />
                    <div className="gc-ops-body">
                      <p className="gc-ops-name hsm-title" title={s.title}>{s.title}</p>
                      <p className="gc-ops-meta">{s.file_kind === "pdf" ? "PDF" : "Image"} · {audienceLabels(s)}</p>
                    </div>
                    <a className="gc-icon" href={s.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${s.title}`}>
                      <ExternalLink size={16} aria-hidden />
                    </a>
                    <button type="button" className="gc-icon" onClick={() => openEdit(s)} aria-label={`Edit ${s.title}`}>
                      <Pencil size={16} aria-hidden />
                    </button>
                    <button type="button" className="gc-icon hsm-del" onClick={() => setRemoving(s)} aria-label={`Remove ${s.title}`}>
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <Sheet open={form !== null} onClose={() => !busy && setForm(null)} title={form?.id ? "Edit Section" : "Add Section"}>
        {form && (
          <form className="gc-form" onSubmit={save}>
            <label className="gc-field">
              <span>Title</span>
              <input className="gc-input" value={form.title} maxLength={80} placeholder="Day 1 Action Plan" onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>

            <div className="gc-field">
              <span>File</span>
              <label className="gc-btn gc-upload hsm-file">
                <FileUp size={16} aria-hidden />
                {form.file ? form.file.name : form.id ? "Replace File" : "Choose File"}
                <input type="file" accept={HOME_FILE_ACCEPT} className="gc-sr" disabled={busy} onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              {form.id && !form.file && <small className="gc-muted">Keeps the current file unless you pick a new one.</small>}
            </div>

            <fieldset className="gc-field hsm-roles">
              <span>Who Sees It</span>
              <div className="gc-pills">
                {HOME_AUDIENCES.map((a) => (
                  <button key={a.key} type="button" aria-pressed={form.audiences.includes(a.key)} onClick={() => toggleAudience(a.key)}>
                    {a.label}
                  </button>
                ))}
              </div>
              <small className="gc-muted">Game Masters include Guardian GM. Committee includes HOF, OC, HOGM and Admin.</small>
              <div className="hsm-quick">
                <button type="button" className="gc-link" onClick={() => setForm({ ...form, audiences: HOME_AUDIENCES.map((a) => a.key) })}>Select All</button>
                <button type="button" className="gc-link" onClick={() => setForm({ ...form, audiences: [] })}>Clear</button>
              </div>
            </fieldset>

            {formError && <p className="gc-status gc-status-err" role="alert">{formError}</p>}
            <div className="gc-row2">
              <button type="button" className="gc-btn" disabled={busy} onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="gc-btn gc-btn-primary" disabled={busy}>
                {busy ? "Saving…" : form.id ? "Save" : "Add Section"}
              </button>
            </div>
          </form>
        )}
      </Sheet>

      <ConfirmSheet
        open={removing !== null}
        onClose={() => !busy && setRemoving(null)}
        onConfirm={remove}
        title="Remove Section?"
        body={<>“{removing?.title}” disappears from Home for everyone who sees it{removing?.storage_path ? ", and its file is deleted" : ""}.</>}
        confirmLabel="Remove"
        danger
        busy={busy}
      />
    </div>
  );
}
