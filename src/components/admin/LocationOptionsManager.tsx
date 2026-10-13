"use client";

import { ArrowDown, ArrowUp, Check, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";

import { Card, ErrorBanner, SuccessBanner } from "@/components/ui";
import { LOC_OPTIONS_CHANGED, useLocationOptions } from "@/components/useLocationOptions";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";

const supabase = supabaseBrowser();

// Admin manages the locations a Facilitator can pick (A1, A3, ...): add,
// rename, reorder and delete (migration 0076). Renaming also renames them in
// earlier updates. Deleting a location that earlier updates used archives it:
// it leaves the dropdowns and those updates keep their text.
export function LocationOptionsManager() {
  const { active, loaded, unavailable, reload } = useLocationOptions();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2500);
  }

  async function run(fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, done?: (data: unknown) => string | null) {
    setBusy(true);
    setError(null);
    const { data, error: err } = await fn();
    setBusy(false);
    if (err) {
      setError(friendlyError(err));
      return false;
    }
    const msg = done?.(data);
    if (msg) flash(msg);
    // refresh this list and every location dropdown on the page right away
    await reload();
    window.dispatchEvent(new Event(LOC_OPTIONS_CHANGED));
    return true;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const ok = await run(() => supabase.rpc("fn_admin_location_option_save", { p_id: null, p_name: name }), () => `${name} added.`);
    if (ok) setNewName("");
  }

  async function rename(id: number) {
    const name = draft.trim();
    if (!name) return;
    const ok = await run(() => supabase.rpc("fn_admin_location_option_save", { p_id: id, p_name: name }), () => `Renamed to ${name}.`);
    if (ok) setEditingId(null);
  }

  async function remove(id: number, name: string) {
    if (!window.confirm(`Delete ${name}? If earlier updates used it, it is hidden from the dropdowns and those updates keep the text.`)) return;
    await run(
      () => supabase.rpc("fn_admin_location_option_delete", { p_id: id }),
      (data) => ((data as { archived?: boolean })?.archived ? `${name} hidden (earlier updates use it).` : `${name} deleted.`)
    );
  }

  const move = (id: number, dir: -1 | 1) =>
    run(() => supabase.rpc("fn_admin_location_option_move", { p_id: id, p_direction: dir }));

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h3 className="text-base font-bold">Locations</h3>
        <p className="text-sm text-ink-faint">
          The places a Facilitator can choose. Add, rename, reorder or delete them. Renaming also renames earlier updates.
        </p>
      </div>
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <form onSubmit={add} className="flex gap-2">
        <input
          className="input min-h-[44px] min-w-0 flex-1 text-base"
          aria-label="New location name"
          maxLength={40}
          placeholder="New location, e.g. A6"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="btn-primary min-h-[44px] px-4" disabled={busy || !newName.trim()}>
          Add
        </button>
      </form>

      {!loaded ? null : unavailable ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
          The locations table is not available yet. Run migration 0076 in Supabase, then reload this page.
        </p>
      ) : active.length === 0 ? (
        <p className="text-sm text-ink-faint">No locations yet. Add the first one above.</p>
      ) : (
        <ul className="divide-y divide-paper-200 rounded-xl border border-paper-200">
          {active.map((o, i) => (
            <li key={o.id} className="flex items-center gap-2 px-3 py-2">
              {editingId === o.id ? (
                <>
                  <input
                    className="input min-h-[40px] min-w-0 flex-1 text-base"
                    aria-label={`Rename ${o.name}`}
                    maxLength={40}
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") rename(o.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <IconButton label="Save name" disabled={busy || !draft.trim()} onClick={() => rename(o.id)}>
                    <Check size={16} />
                  </IconButton>
                  <IconButton label="Cancel" onClick={() => setEditingId(null)}>
                    <X size={16} />
                  </IconButton>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate font-medium">{o.name}</span>
                  <IconButton label={`Move ${o.name} up`} disabled={busy || i === 0} onClick={() => move(o.id, -1)}>
                    <ArrowUp size={16} />
                  </IconButton>
                  <IconButton label={`Move ${o.name} down`} disabled={busy || i === active.length - 1} onClick={() => move(o.id, 1)}>
                    <ArrowDown size={16} />
                  </IconButton>
                  <IconButton
                    label={`Rename ${o.name}`}
                    onClick={() => {
                      setEditingId(o.id);
                      setDraft(o.name);
                    }}
                  >
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton label={`Delete ${o.name}`} danger disabled={busy} onClick={() => remove(o.id, o.name)}>
                    <Trash2 size={16} />
                  </IconButton>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition hover:bg-paper-200 active:scale-95 disabled:opacity-40 ${danger ? "text-red-500" : "text-ink-soft"}`}
    >
      {children}
    </button>
  );
}
