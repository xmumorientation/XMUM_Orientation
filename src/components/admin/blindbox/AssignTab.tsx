"use client";

import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";

import { Card } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { BLINDBOX_HOLDER_ROLES, ROLE_LABELS, type UserRole } from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

import type { TabProps } from "./TypesTab";

type Who = "accounts" | "role";

// One form, in order: which box type, who gets it, how many each. People only
// (accounts or every account with a role); the Spot has its own step. The
// number is ADDED to what each person already holds, and it is all-or-nothing:
// if stock can't cover everyone, nobody is assigned. Stock is raised in step 1.
export function AssignTab({ data, onError, onNotice, goTo }: TabProps) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const liveTypes = data.types.filter((t) => !t.archived);

  const [busy, setBusy] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [who, setWho] = useState<Who>("accounts");
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<UserRole>("gm");
  const [qty, setQty] = useState("1");

  const type = liveTypes.find((t) => String(t.id) === typeId);
  const left = type ? data.typeStats[type.id]?.unassigned ?? 0 : 0;
  const targets = who === "role" ? data.staff.filter((s) => s.role === role).length : picked.length;
  const qtyN = Math.floor(Number(qty)) || 0;
  const need = targets * qtyN;
  const short = type ? Math.max(0, need - left) : 0;
  const ready = !!type && qtyN >= 1 && targets > 0 && short === 0;

  const q = search.trim().toLowerCase();
  const shown = data.staff.filter((s) => !q || (s.full_name || "").toLowerCase().includes(q));

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    if (!type || !ready) return;
    setBusy(true);
    onError(null);
    const { error } = await supabase.rpc("fn_bb_assign", {
      p_type_id: type.id,
      p_quantity: qtyN,
      p_role: who === "role" ? role : null,
      p_profile_ids: who === "accounts" ? picked : null,
    });
    setBusy(false);
    if (error) return onError(friendlyError(error));
    onNotice(`Gave ${need} ${type.name} box${need === 1 ? "" : "es"} to ${targets} ${targets === 1 ? "person" : "people"}.`);
    setPicked([]);
    data.reload();
  }

  if (liveTypes.length === 0) {
    return (
      <Card className="max-w-xl space-y-3 text-sm">
        <p className="font-semibold">No box types yet</p>
        <p className="text-ink-faint">Create a box type first, then come back to hand it out.</p>
        <button type="button" onClick={() => goTo("types")} className="btn-primary px-4">
          Go to Step 1
        </button>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl">
      <form onSubmit={assign} className="space-y-5">
        <div className="space-y-2">
          <label className="label" htmlFor="bb-assign-type">
            1. Which Box Type?
          </label>
          <select
            id="bb-assign-type"
            required
            className="input"
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
          >
            <option value="">Select box type…</option>
            {liveTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} / {data.typeStats[t.id]?.unassigned ?? 0} unassigned
              </option>
            ))}
          </select>
        </div>

        <fieldset className="space-y-2">
          <legend className="label">2. Who Gets It?</legend>
          <div className="grid grid-cols-2 gap-1 rounded-[1.1rem] bg-paper-200 p-1">
            {(
              [
                ["accounts", "Pick People"],
                ["role", "Everyone with a Role"],
              ] as [Who, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={who === k}
                onClick={() => setWho(k)}
                className={cn(
                  "rounded-[0.9rem] px-3 py-2 text-sm font-bold",
                  who === k ? "bg-white text-ink shadow-card" : "text-ink-faint"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {who === "role" ? (
            <>
              <select
                className="input"
                aria-label="Role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                {BLINDBOX_HOLDER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    Every {ROLE_LABELS[r]} ({data.staff.filter((s) => s.role === r).length})
                  </option>
                ))}
              </select>
              <p className="text-xs text-ink-faint">
                Covers today&apos;s accounts only. Run it again for accounts added later.
              </p>
            </>
          ) : (
            <div className="rounded-xl border border-paper-200">
              <div className="flex items-center gap-2 border-b border-paper-200 p-2">
                <input
                  className="input min-h-[36px] flex-1 py-1 text-sm"
                  placeholder="Search people…"
                  aria-label="Search people"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <span className="shrink-0 px-1 text-xs font-semibold">{picked.length} picked</span>
                {picked.length > 0 && (
                  <button type="button" className="text-xs underline" onClick={() => setPicked([])}>
                    Clear
                  </button>
                )}
              </div>
              <ul className="max-h-60 divide-y divide-paper-200 overflow-y-auto">
                {shown.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-paper-100">
                      <input
                        type="checkbox"
                        checked={picked.includes(s.id)}
                        onChange={(e) =>
                          setPicked((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)))
                        }
                      />
                      <span className="flex-1 truncate">{s.full_name || s.id.slice(0, 8)}</span>
                      <span className="text-xs text-ink-faint">{ROLE_LABELS[s.role]}</span>
                    </label>
                  </li>
                ))}
                {shown.length === 0 && <li className="px-3 py-4 text-center text-sm text-ink-faint">Nobody matches.</li>}
              </ul>
            </div>
          )}
        </fieldset>

        <div className="space-y-2">
          <label className="label" htmlFor="bb-assign-qty">
            3. How Many Boxes Each?
          </label>
          <input
            id="bb-assign-qty"
            type="number"
            min="1"
            required
            className="input w-32"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
          <p className="text-xs text-ink-faint">Added to what each person already holds.</p>
        </div>

        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm",
            short ? "bg-red-50 text-red-700" : "bg-paper-200"
          )}
          aria-live="polite"
        >
          {type ? (
            <>
              <span>
                {targets} × {qtyN} = <b className="font-mono">{need}</b> needed / {type.name} has{" "}
                <b className="font-mono">{left}</b> unassigned
                {short > 0 && `: ${short} short`}
              </span>
              {short > 0 && (
                <button type="button" onClick={() => goTo("types")} className="text-sm font-semibold underline">
                  Add Stock in Step 1
                </button>
              )}
            </>
          ) : (
            <span className="text-ink-faint">Pick a box type to see the stock.</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button disabled={busy || !ready} type="submit" className="btn-primary px-6 active:scale-[0.98]">
            {busy ? "Assigning…" : ready ? `Assign ${need} box${need === 1 ? "" : "es"}` : "Assign"}
          </button>
          <button type="button" onClick={() => goTo("codes")} className="flex items-center gap-1 text-sm text-ink-faint hover:text-ink">
            See codes & stock <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      </form>
    </Card>
  );
}
