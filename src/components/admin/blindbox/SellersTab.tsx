"use client";

import { Check, Copy, Sparkles } from "lucide-react";
import QRCode from "qrcode";
import { useMemo, useState } from "react";

import { Card } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { BlindBoxAssignment } from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

import type { TabProps } from "./TypesTab";

interface QrPreview {
  seller: string;
  type: string;
  url: string;
  dataUrl: string;
}

// One row per assignment: who holds which box type, how many were opened, the
// link and QR Admin can preview (previewing never changes anything), and the
// controls: set quantity, regenerate the QR, switch off, remove.
export function SellersTab({ data, onError, onNotice }: TabProps) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [copied, setCopied] = useState<number | null>(null);
  const [preview, setPreview] = useState<QrPreview | null>(null);

  const rows = data.assignments.filter((a) => {
    if (typeFilter && String(a.type_id) !== typeFilter) return false;
    const q = search.trim().toLowerCase();
    return !q || data.sellerName(a).toLowerCase().includes(q);
  });

  async function call(fn: string, args: Record<string, unknown>, okMsg: string) {
    onError(null);
    const { error } = await supabase.rpc(fn, args);
    if (error) {
      onError(friendlyError(error));
      return false;
    }
    onNotice(okMsg);
    data.reload();
    return true;
  }

  async function saveQty(a: BlindBoxAssignment) {
    const next = Math.floor(Number(edits[a.id]));
    if (!Number.isFinite(next)) return;
    const ok = await call(
      "fn_bb_set_quantity",
      { p_assignment_id: a.id, p_quantity: next },
      "Quantity updated."
    );
    if (ok) {
      setEdits((cur) => {
        const next = { ...cur };
        delete next[a.id];
        return next;
      });
    }
  }

  async function remove(a: BlindBoxAssignment) {
    if (!window.confirm(`Remove ${data.sellerName(a)}'s boxes? The unopened boxes return to stock.`)) {
      return;
    }
    await call("fn_bb_set_quantity", { p_assignment_id: a.id, p_quantity: 0 }, "Removed.");
  }

  async function regenerate(a: BlindBoxAssignment) {
    if (
      !window.confirm(
        `Regenerate the QR for ${data.sellerName(a)}? Any QR already shown or printed stops working. Boxes already opened are unaffected.`
      )
    ) {
      return;
    }
    await call("fn_bb_regenerate", { p_id: a.id }, "New QR generated. The old one no longer works.");
  }

  async function copy(id: number, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      // Clipboard can be blocked; the link text stays selectable.
    }
  }

  async function showQr(a: BlindBoxAssignment) {
    const link = data.links[a.id];
    if (!link) return onError("The link isn't ready yet. Try again in a moment.");
    const dataUrl = await QRCode.toDataURL(link.url, { width: 560, margin: 2 });
    setPreview({
      seller: data.sellerName(a),
      type: data.types.find((t) => t.id === a.type_id)?.name ?? "Box",
      url: link.url,
      dataUrl,
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          className="input w-auto"
          aria-label="Filter by box type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All box types</option>
          {data.types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.archived ? " (archived)" : ""}
            </option>
          ))}
        </select>
        <input
          className="input w-auto min-w-[14rem]"
          placeholder="Search seller…"
          aria-label="Search seller"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card className="overflow-x-auto p-0">
        <p className="border-b border-paper-200 px-4 py-3 text-sm font-semibold">
          Assignments ({rows.length})
        </p>
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-paper-200 text-xs font-bold uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-2.5">Seller</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5">Assigned</th>
              <th className="px-3 py-2.5">Opened</th>
              <th className="px-3 py-2.5">Left</th>
              <th className="px-3 py-2.5">Link</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-200">
            {rows.map((a) => {
              const type = data.types.find((t) => t.id === a.type_id);
              const left = a.quantity - a.opened;
              const link = data.links[a.id];
              const dead = !a.active || type?.archived;
              const editing = edits[a.id] !== undefined && Number(edits[a.id]) !== a.quantity;
              return (
                <tr key={a.id} className={cn(dead && "opacity-60")}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{data.sellerName(a)}</p>
                    <p className="text-xs text-ink-faint">{data.sellerKind(a)}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1">
                      {type?.name ?? "?"}
                      {type?.is_special && (
                        <Sparkles size={14} strokeWidth={1.75} className="text-amber-500" />
                      )}
                    </span>
                    {type?.archived && <p className="text-xs text-red-600">archived</p>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={a.opened}
                        aria-label="Assigned quantity"
                        className="input min-h-[36px] w-16 px-2 py-1 text-sm"
                        value={edits[a.id] ?? String(a.quantity)}
                        onChange={(e) => setEdits({ ...edits, [a.id]: e.target.value })}
                      />
                      {editing && (
                        <button
                          onClick={() => saveQty(a)}
                          className="btn-primary min-h-[36px] px-2 text-xs"
                        >
                          Set
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{a.opened}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {left <= 0 ? (
                      <span className="chip bg-gray-200 text-gray-700">sold out</span>
                    ) : (
                      left
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {link ? (
                      <div className="flex items-center gap-1">
                        <input
                          readOnly
                          aria-label="Blind box link"
                          value={link.url}
                          onFocus={(e) => e.currentTarget.select()}
                          className="input min-h-[36px] w-48 px-2 py-1 text-xs"
                        />
                        <button
                          onClick={() => copy(a.id, link.url)}
                          aria-label="Copy link"
                          className="btn-secondary min-h-[36px] px-2"
                        >
                          {copied === a.id ? (
                            <Check size={14} strokeWidth={2} />
                          ) : (
                            <Copy size={14} strokeWidth={1.75} />
                          )}
                        </button>
                      </div>
                    ) : data.linksStatus === "error" ? (
                      <button
                        onClick={() => data.reload()}
                        className="text-xs text-red-500 underline"
                      >
                        couldn&apos;t load · retry
                      </button>
                    ) : (
                      <span className="text-xs text-ink-faint">loading…</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => showQr(a)}
                        className="btn-secondary min-h-[36px] px-3 text-xs"
                      >
                        QR
                      </button>
                      <button
                        onClick={() => regenerate(a)}
                        className="btn-secondary min-h-[36px] px-3 text-xs"
                      >
                        Regenerate
                      </button>
                      <button
                        onClick={() =>
                          call(
                            "fn_bb_assignment_set_active",
                            { p_id: a.id, p_active: !a.active },
                            a.active ? "Switched off." : "Switched on."
                          )
                        }
                        className={cn(
                          "btn min-h-[36px] min-w-[64px] px-3 text-xs",
                          a.active
                            ? "bg-green-600 text-white"
                            : "border border-paper-300 bg-white text-ink-faint"
                        )}
                      >
                        {a.active ? "Active" : "Off"}
                      </button>
                      {a.opened === 0 && (
                        <button
                          onClick={() => remove(a)}
                          className="btn min-h-[36px] border border-red-200 bg-white px-3 text-xs text-red-600"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-faint">
                  Nothing assigned yet. Use the Assign tab.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {preview && (
        <div
          className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-black/70 p-6"
          onClick={() => setPreview(null)}
        >
          <div
            className="card max-w-sm bg-white p-5 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-semibold">{preview.seller}</p>
            <p className="mb-2 text-sm text-ink-faint">{preview.type}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.dataUrl} alt="Blind box QR" className="w-full" />
            <input
              readOnly
              value={preview.url}
              aria-label="Blind box link"
              onFocus={(e) => e.currentTarget.select()}
              className="input mt-3 text-xs"
            />
            <p className="mt-2 text-xs text-ink-faint">
              Preview only — this is the seller&apos;s current QR and nothing was
              changed. Use Regenerate to replace it. Tap outside to close.
            </p>
            <button onClick={() => setPreview(null)} className="btn-secondary mt-3 w-full">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
