"use client";

import { QrCode, Sparkles } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Card, ErrorBanner, PageTitle, SuccessBanner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useConfig } from "@/components/useConfig";
import {
  ROLE_LABELS,
  type BlindBoxAllocation,
  type Profile,
} from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

// Admin blind-box management: assign personal QRs to committee members
// (count + token range per member, all runtime-configurable), monitor
// usage, and configure the limited GM-sold box.
export default function AdminBlindBoxPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { config } = useConfig();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [allocations, setAllocations] = useState<BlindBoxAllocation[]>([]);
  const [claimCounts, setClaimCounts] = useState<Record<number, number>>({});
  const [salesCount, setSalesCount] = useState(0);
  const [form, setForm] = useState({
    profileId: "",
    boxType: "normal" as "normal" | "special",
    minTokens: 1,
    maxTokens: 2,
    totalBoxes: 2,
  });
  const [qrPreview, setQrPreview] = useState<{
    name: string;
    dataUrl: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: st }, { data: allocs }, { data: claims }, { count }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("*")
          .eq("role", "admin")
          .order("role")
          .order("full_name"),
        supabase.from("blind_box_allocations").select("*").order("id"),
        supabase.from("blind_box_claims").select("allocation_id"),
        supabase
          .from("blind_box_sales")
          .select("*", { count: "exact", head: true }),
      ]);
    setStaff((st as Profile[]) ?? []);
    setAllocations((allocs as BlindBoxAllocation[]) ?? []);
    const counts: Record<number, number> = {};
    for (const c of claims ?? []) {
      const id = (c as { allocation_id: number }).allocation_id;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    setClaimCounts(counts);
    setSalesCount(count ?? 0);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2500);
  }

  async function allocate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.profileId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/blindbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Failed");
      else {
        flash(
          "QR allocated. The member can also generate it on their Operations page."
        );
        // Hash-only tokens (0007): this response is the only time the new
        // QR is available without another rotation — show it right away.
        if (data.url) {
          const member = staff.find((s) => s.id === form.profileId);
          const dataUrl = await QRCode.toDataURL(data.url, {
            width: 560,
            margin: 2,
          });
          setQrPreview({ name: member?.full_name ?? "member", dataUrl });
        }
        load();
      }
    } catch (err) {
      setError(String(err));
    }
    setBusy(false);
  }

  async function toggleActive(a: BlindBoxAllocation) {
    const { error } = await supabase
      .from("blind_box_allocations")
      .update({ active: !a.active })
      .eq("id", a.id);
    if (error) setError(error.message);
    else load();
  }

  // Tokens are hash-only (0007) — previewing mints a fresh token via the
  // rotation route, which invalidates the member's previously shown QR.
  async function showQr(a: BlindBoxAllocation) {
    setError(null);
    try {
      const res = await fetch("/api/blindbox/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: a.profile_id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to generate QR");
        return;
      }
      const member = staff.find((s) => s.id === a.profile_id);
      const dataUrl = await QRCode.toDataURL(data.url, {
        width: 560,
        margin: 2,
      });
      setQrPreview({ name: member?.full_name ?? "member", dataUrl });
    } catch (err) {
      setError(String(err));
    }
  }

  async function saveGmConfig(key: string, value: number) {
    const { error } = await supabase.rpc("fn_set_config", {
      p_key: key,
      p_value: value,
    });
    if (error) setError(friendlyError(error));
    else flash("Saved.");
  }

  const allocated = new Set(allocations.map((a) => a.profile_id));

  return (
    <div className="space-y-4">
      <PageTitle
        title="Blind boxes"
        subtitle="Admin-issued personal QRs and the GM-sold box"
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <Card className="space-y-2">
        <h2 className="font-semibold">Assign / regenerate a member QR</h2>
        <form onSubmit={allocate} className="space-y-2">
          <select
            className="input"
            required
            value={form.profileId}
            onChange={(e) => setForm({ ...form, profileId: e.target.value })}
          >
            <option value="">Select Admin operator…</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name} ({ROLE_LABELS[s.role]})
                {allocated.has(s.id) ? " — has QR" : ""}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-4 gap-2">
            <select
              className="input text-sm"
              value={form.boxType}
              onChange={(e) =>
                setForm({
                  ...form,
                  boxType: e.target.value as "normal" | "special",
                })
              }
            >
              <option value="normal">Normal</option>
              <option value="special">Special</option>
            </select>
            <input
              type="number"
              min="0"
              className="input text-sm"
              title="Min tokens"
              value={form.minTokens}
              onChange={(e) =>
                setForm({ ...form, minTokens: Number(e.target.value) })
              }
            />
            <input
              type="number"
              min="0"
              className="input text-sm"
              title="Max tokens"
              value={form.maxTokens}
              onChange={(e) =>
                setForm({ ...form, maxTokens: Number(e.target.value) })
              }
            />
            <input
              type="number"
              min="0"
              className="input text-sm"
              title="Number of boxes"
              value={form.totalBoxes}
              onChange={(e) =>
                setForm({ ...form, totalBoxes: Number(e.target.value) })
              }
            />
          </div>
          <p className="text-xs text-ink-faint">
            Type · min tokens · max tokens · box count. HOGM spec: HOF/HOGM 2
            boxes of 1–2, OC 1 box of 1–2, special OC boxes 4–6.
            Regenerating invalidates the member&apos;s previous QR.
          </p>
          <button disabled={busy} type="submit" className="btn-primary w-full">
            <QrCode size={20} strokeWidth={1.75} />
            Generate QR
          </button>
        </form>
      </Card>

      <Card className="p-0">
        <p className="border-b border-paper-200 px-4 py-2 text-sm font-semibold">
          Allocations ({allocations.length})
        </p>
        <div className="max-h-[360px] divide-y divide-paper-200 overflow-y-auto">
          {allocations.map((a) => {
            const member = staff.find((s) => s.id === a.profile_id);
            return (
              <div key={a.id} className="flex items-center gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-sm font-medium">
                    {member?.full_name ?? a.profile_id.slice(0, 8)}
                    {a.box_type === "special" && (
                      <Sparkles size={14} strokeWidth={1.75} className="shrink-0 text-amber-500" />
                    )}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {claimCounts[a.id] ?? 0}/{a.total_boxes} used ·{" "}
                    {a.min_tokens}–{a.max_tokens} tokens
                  </p>
                </div>
                <button
                  onClick={() => showQr(a)}
                  className="btn-secondary min-h-[36px] px-3 text-xs"
                >
                  QR
                </button>
                <button
                  onClick={() => toggleActive(a)}
                  className={cn(
                    "btn min-h-[36px] min-w-[64px] px-3 text-xs",
                    a.active
                      ? "bg-green-600 text-white"
                      : "border border-paper-300 bg-white text-ink-faint"
                  )}
                >
                  {a.active ? "Active" : "Off"}
                </button>
              </div>
            );
          })}
          {allocations.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-ink-faint">
              No QRs assigned yet.
            </p>
          )}
        </div>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">GM-sold box settings</h2>
        <p className="text-xs text-ink-faint">
          {salesCount} sold so far. Price / min / max / total stock:
        </p>
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              ["gm_blindbox_price", "Price"],
              ["gm_blindbox_min", "Min"],
              ["gm_blindbox_max", "Max"],
              ["gm_blindbox_stock", "Stock"],
            ] as [string, string][]
          ).map(([key, label]) => (
            <div key={key}>
              <label className="label text-xs">{label}</label>
              <input
                type="number"
                min="0"
                className="input text-sm"
                defaultValue={Number(config[key] ?? 0)}
                onBlur={(e) => saveGmConfig(key, Number(e.target.value))}
              />
            </div>
          ))}
        </div>
      </Card>

      {qrPreview && (
        <div
          className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-black/70 p-6"
          onClick={() => setQrPreview(null)}
        >
          <div className="card max-w-sm bg-white p-5 text-center">
            <p className="mb-2 font-semibold">{qrPreview.name}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrPreview.dataUrl} alt="Blind box QR" className="w-full" />
            <p className="mt-2 text-xs text-ink-faint">
              Fresh QR — any previously shown or printed QR for this member is
              now invalid. Screenshot or print this for them. Tap anywhere to
              close.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
