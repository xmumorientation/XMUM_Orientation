"use client";

import { Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { Card } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { BlindBoxType } from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

import type { BlindBoxAdminData } from "./useBlindBoxAdmin";

export interface TabProps {
  data: BlindBoxAdminData;
  onError: (m: string | null) => void;
  onNotice: (m: string) => void;
}

const EMPTY = { name: "", min: "1", max: "2", price: "0", stock: "10", special: false };

// Box types: create, edit, delete. A type that has been assigned is archived
// instead of deleted (history stays; its QRs stop working).
export function TypesTab({ data, onError, onNotice }: TabProps) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const live = data.types.filter((t) => !t.archived);
  const archived = data.types.filter((t) => t.archived);

  function edit(t: BlindBoxType) {
    setEditingId(t.id);
    setForm({
      name: t.name,
      min: String(t.min_tokens),
      max: String(t.max_tokens),
      price: String(t.price),
      stock: String(t.stock),
      special: t.is_special,
    });
    onError(null);
  }

  function reset() {
    setEditingId(null);
    setForm(EMPTY);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    const { error } = await supabase.rpc("fn_bb_type_save", {
      p_id: editingId,
      p_name: form.name,
      p_min: Number(form.min),
      p_max: Number(form.max),
      p_price: Number(form.price),
      p_stock: Number(form.stock),
      p_special: form.special,
    });
    setBusy(false);
    if (error) return onError(friendlyError(error));
    onNotice(editingId ? "Box type updated." : "Box type created.");
    reset();
    data.reload();
  }

  async function remove(t: BlindBoxType) {
    const used = (data.typeStats[t.id]?.assignments ?? 0) > 0;
    const ok = window.confirm(
      used
        ? `"${t.name}" has already been assigned, so it will be ARCHIVED: its QR codes stop working and it cannot be assigned again. History is kept. Continue?`
        : `Delete the box type "${t.name}"?`
    );
    if (!ok) return;
    onError(null);
    const { data: res, error } = await supabase.rpc("fn_bb_type_delete", { p_id: t.id });
    if (error) return onError(friendlyError(error));
    onNotice((res as { archived?: boolean })?.archived ? "Box type archived." : "Box type deleted.");
    if (editingId === t.id) reset();
    data.reload();
  }

  const set = (k: keyof typeof EMPTY, v: string | boolean) => setForm({ ...form, [k]: v });

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <Card className="space-y-3">
        <h2 className="font-semibold">{editingId ? "Edit box type" : "New box type"}</h2>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="label text-xs" htmlFor="bb-name">
              Name
            </label>
            <input
              id="bb-name"
              required
              className="input"
              placeholder="e.g. Normal, Special, OC box"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label text-xs" htmlFor="bb-min">
                Min tokens
              </label>
              <input
                id="bb-min"
                type="number"
                min="0"
                required
                className="input"
                value={form.min}
                onChange={(e) => set("min", e.target.value)}
              />
            </div>
            <div>
              <label className="label text-xs" htmlFor="bb-max">
                Max tokens
              </label>
              <input
                id="bb-max"
                type="number"
                min="0"
                required
                className="input"
                value={form.max}
                onChange={(e) => set("max", e.target.value)}
              />
            </div>
            <div>
              <label className="label text-xs" htmlFor="bb-price">
                Price (tokens)
              </label>
              <input
                id="bb-price"
                type="number"
                min="0"
                required
                className="input"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
              />
            </div>
            <div>
              <label className="label text-xs" htmlFor="bb-stock">
                Total stock
              </label>
              <input
                id="bb-stock"
                type="number"
                min="0"
                required
                className="input"
                value={form.stock}
                onChange={(e) => set("stock", e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.special}
              onChange={(e) => set("special", e.target.checked)}
            />
            Special box (gold reveal)
          </label>
          <p className="text-xs text-ink-faint">
            Price 0 = free reward box. Stock is the number of boxes that exist;
            hand them out on the Assign tab. Edits to range and price apply to
            boxes opened from now on.
          </p>
          <div className="flex gap-2">
            <button disabled={busy} type="submit" className="btn-primary flex-1">
              {editingId ? "Save changes" : "Create type"}
            </button>
            {editingId && (
              <button type="button" onClick={reset} className="btn-secondary">
                Cancel
              </button>
            )}
          </div>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        <p className="border-b border-paper-200 px-4 py-3 text-sm font-semibold">
          Box types ({live.length})
        </p>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-paper-200 text-xs font-bold uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-2.5">Type</th>
              <th className="px-3 py-2.5">Range</th>
              <th className="px-3 py-2.5">Price</th>
              <th className="px-3 py-2.5">Stock</th>
              <th className="px-3 py-2.5">Unassigned</th>
              <th className="px-3 py-2.5">Opened</th>
              <th className="px-3 py-2.5">Left</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-200">
            {live.map((t) => {
              const s = data.typeStats[t.id];
              return (
                <tr key={t.id}>
                  <td className="px-4 py-2.5 font-medium">
                    <span className="inline-flex items-center gap-1">
                      {t.name}
                      {t.is_special && (
                        <Sparkles size={14} strokeWidth={1.75} className="text-amber-500" />
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {t.min_tokens}–{t.max_tokens}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{t.price}</td>
                  <td className="px-3 py-2.5 tabular-nums">{t.stock}</td>
                  <td
                    className={cn(
                      "px-3 py-2.5 tabular-nums",
                      s.unassigned === 0 ? "text-ink-faint" : "font-semibold"
                    )}
                  >
                    {s.unassigned}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{s.opened}</td>
                  <td className="px-3 py-2.5 tabular-nums">{s.left}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => edit(t)}
                        className="btn-secondary min-h-[36px] px-3 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(t)}
                        className="btn min-h-[36px] border border-red-200 bg-white px-3 text-xs text-red-600"
                      >
                        {s.assignments > 0 ? "Archive" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {live.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-ink-faint">
                  No box types yet. Create one on the left.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {archived.length > 0 && (
          <p className="border-t border-paper-200 px-4 py-3 text-xs text-ink-faint">
            Archived (history only): {archived.map((t) => t.name).join(", ")}
          </p>
        )}
      </Card>
    </div>
  );
}
