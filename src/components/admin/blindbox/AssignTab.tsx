"use client";

import { useMemo, useState } from "react";

import { Card } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  BLINDBOX_HOLDER_ROLES,
  ROLE_LABELS,
  type BlindBoxType,
  type UserRole,
} from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

import type { TabProps } from "./TypesTab";

type BulkMode = "role" | "all_stations" | "stations";

// Hand boxes to sellers. Quantity is ADDED to what a seller already holds.
// Bulk is all-or-nothing: if stock can't cover quantity x sellers, nothing is
// assigned (the server re-checks; the numbers below are the live preview).
export function AssignTab({ data, onError, onNotice }: TabProps) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const liveTypes = data.types.filter((t) => !t.archived);

  const [busy, setBusy] = useState(false);

  // ── single ──
  const [sType, setSType] = useState("");
  const [sKind, setSKind] = useState<"account" | "station">("account");
  const [sTarget, setSTarget] = useState("");
  const [sQty, setSQty] = useState("1");

  // ── bulk ──
  const [bType, setBType] = useState("");
  const [bQty, setBQty] = useState("1");
  const [bMode, setBMode] = useState<BulkMode>("role");
  const [bRole, setBRole] = useState<UserRole>("gm");
  const [bStations, setBStations] = useState<number[]>([]);

  const gmCount = (stationId: number) =>
    data.staff.filter(
      (s) => s.station_id === stationId && (s.role === "gm" || s.role === "guardian_gm")
    ).length;

  const bTargets =
    bMode === "role"
      ? data.staff.filter((s) => s.role === bRole).length
      : bMode === "all_stations"
        ? data.stations.length
        : bStations.length;
  const bQtyN = Math.floor(Number(bQty)) || 0;
  const bNeed = bTargets * bQtyN;
  const bTypeObj = liveTypes.find((t) => String(t.id) === bType);
  const bLeft = bTypeObj ? data.typeStats[bTypeObj.id]?.unassigned ?? 0 : 0;
  const bShort = bTypeObj ? bNeed > bLeft : false;
  const bReady = !!bTypeObj && bQtyN >= 1 && bTargets > 0 && !bShort;

  const sTypeObj = liveTypes.find((t) => String(t.id) === sType);
  const sLeft = sTypeObj ? data.typeStats[sTypeObj.id]?.unassigned ?? 0 : 0;
  const sQtyN = Math.floor(Number(sQty)) || 0;
  const sShort = sTypeObj ? Math.max(0, sQtyN - sLeft) : 0;

  async function run(args: Record<string, unknown>, okMessage: string) {
    setBusy(true);
    onError(null);
    const { error } = await supabase.rpc("fn_bb_assign", args);
    setBusy(false);
    if (error) {
      onError(friendlyError(error));
      return false;
    }
    onNotice(okMessage);
    data.reload();
    return true;
  }

  // Stock is a hard limit, so a shortfall is fixed by raising the type's stock
  // (an explicit click), never by letting "unassigned" go negative.
  async function addStock(t: BlindBoxType, extra: number) {
    if (extra < 1) return;
    setBusy(true);
    onError(null);
    const { error } = await supabase.rpc("fn_bb_type_save", {
      p_id: t.id,
      p_name: t.name,
      p_min: t.min_tokens,
      p_max: t.max_tokens,
      p_price: t.price,
      p_stock: t.stock + extra,
      p_special: t.is_special,
    });
    setBusy(false);
    if (error) return onError(friendlyError(error));
    onNotice(`Added ${extra} to ${t.name} stock (now ${t.stock + extra}).`);
    data.reload();
  }

  async function assignOne(e: React.FormEvent) {
    e.preventDefault();
    if (!sTypeObj || !sTarget) return;
    const ok = await run(
      {
        p_type_id: sTypeObj.id,
        p_quantity: Math.floor(Number(sQty)) || 0,
        p_role: null,
        p_profile_ids: sKind === "account" ? [sTarget] : null,
        p_station_ids: sKind === "station" ? [Number(sTarget)] : null,
        p_all_stations: false,
      },
      "Assigned."
    );
    if (ok) setSTarget("");
  }

  async function assignBulk(e: React.FormEvent) {
    e.preventDefault();
    if (!bTypeObj || !bReady) return;
    await run(
      {
        p_type_id: bTypeObj.id,
        p_quantity: bQtyN,
        p_role: bMode === "role" ? bRole : null,
        p_profile_ids: null,
        p_station_ids: bMode === "stations" ? bStations : null,
        p_all_stations: bMode === "all_stations",
      },
      `Assigned ${bQtyN} × ${bTargets} = ${bNeed} boxes.`
    );
  }

  const typeOption = (t: (typeof liveTypes)[number]) => (
    <option key={t.id} value={t.id}>
      {t.name} — {data.typeStats[t.id]?.unassigned ?? 0} unassigned
    </option>
  );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <h2 className="font-semibold">Assign to one seller</h2>
        <form onSubmit={assignOne} className="space-y-3">
          <select
            required
            className="input"
            aria-label="Box type"
            value={sType}
            onChange={(e) => setSType(e.target.value)}
          >
            <option value="">Select box type…</option>
            {liveTypes.map(typeOption)}
          </select>

          <div className="grid grid-cols-2 gap-2 rounded-[1.1rem] bg-paper-200 p-1">
            {(["account", "station"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={sKind === k}
                onClick={() => {
                  setSKind(k);
                  setSTarget("");
                }}
                className={cn(
                  "rounded-[0.9rem] px-3 py-2 text-sm font-bold",
                  sKind === k ? "bg-white text-ink shadow-card" : "text-ink-faint"
                )}
              >
                {k === "account" ? "An account" : "A station"}
              </button>
            ))}
          </div>

          <select
            required
            className="input"
            aria-label="Seller"
            value={sTarget}
            onChange={(e) => setSTarget(e.target.value)}
          >
            <option value="">
              {sKind === "account" ? "Select account…" : "Select station…"}
            </option>
            {sKind === "account"
              ? data.staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name || s.id.slice(0, 8)} ({ROLE_LABELS[s.role]})
                  </option>
                ))
              : data.stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name} ({gmCount(s.id)} GM{gmCount(s.id) === 1 ? "" : "s"})
                  </option>
                ))}
          </select>

          <div>
            <label className="label text-xs" htmlFor="bb-single-qty">
              Number of boxes to add
            </label>
            <input
              id="bb-single-qty"
              type="number"
              min="1"
              required
              className="input"
              value={sQty}
              onChange={(e) => setSQty(e.target.value)}
            />
          </div>

          <p className="text-xs text-ink-faint">
            {sKind === "station"
              ? "A station's boxes are one shared pool and one QR for all its GMs, and a group can open from it once. "
              : "This account sees the QR on its own page. "}
            {sTypeObj ? `${sTypeObj.name}: ${sLeft} unassigned.` : ""}
          </p>
          {sTypeObj && sShort > 0 && (
            <div className="space-y-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              <p>
                Not enough {sTypeObj.name} boxes: this needs {sQtyN} but only {sLeft}{" "}
                {sLeft === 1 ? "is" : "are"} unassigned.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => addStock(sTypeObj, sShort)}
                className="btn-secondary min-h-[36px] px-3 text-xs"
              >
                Add {sShort} to {sTypeObj.name} stock
              </button>
            </div>
          )}
          <button
            disabled={busy || !sTypeObj || !sTarget || sQtyN < 1 || sShort > 0}
            type="submit"
            className="btn-primary w-full"
          >
            Assign
          </button>
        </form>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Bulk assign</h2>
        <form onSubmit={assignBulk} className="space-y-3">
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <select
              required
              className="input"
              aria-label="Box type"
              value={bType}
              onChange={(e) => setBType(e.target.value)}
            >
              <option value="">Select box type…</option>
              {liveTypes.map(typeOption)}
            </select>
            <input
              type="number"
              min="1"
              required
              className="input"
              aria-label="Boxes each"
              title="Boxes for each seller"
              value={bQty}
              onChange={(e) => setBQty(e.target.value)}
            />
          </div>
          <p className="-mt-1 text-xs text-ink-faint">
            Type, then the number of boxes each seller receives.
          </p>

          <div className="grid grid-cols-3 gap-1 rounded-[1.1rem] bg-paper-200 p-1">
            {(
              [
                ["role", "By role"],
                ["all_stations", "All stations"],
                ["stations", "Pick stations"],
              ] as [BulkMode, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={bMode === k}
                onClick={() => setBMode(k)}
                className={cn(
                  "rounded-[0.9rem] px-2 py-2 text-sm font-bold",
                  bMode === k ? "bg-white text-ink shadow-card" : "text-ink-faint"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {bMode === "role" && (
            <select
              className="input"
              aria-label="Role"
              value={bRole}
              onChange={(e) => setBRole(e.target.value as UserRole)}
            >
              {BLINDBOX_HOLDER_ROLES.map((r) => (
                <option key={r} value={r}>
                  All {ROLE_LABELS[r]} accounts ({data.staff.filter((s) => s.role === r).length})
                </option>
              ))}
            </select>
          )}

          {bMode === "all_stations" && (
            <p className="rounded-md bg-paper-200 px-3 py-2 text-sm">
              Every station ({data.stations.length}) gets its own shared pool.
            </p>
          )}

          {bMode === "stations" && (
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-semibold">{bStations.length} selected</span>
                <span className="flex gap-3">
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setBStations(data.stations.map((s) => s.id))}
                  >
                    All
                  </button>
                  <button type="button" className="underline" onClick={() => setBStations([])}>
                    None
                  </button>
                </span>
              </div>
              <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto rounded-md border border-paper-200 p-2">
                {data.stations.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={bStations.includes(s.id)}
                      onChange={(e) =>
                        setBStations((cur) =>
                          e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)
                        )
                      }
                    />
                    <span className="truncate">
                      {s.code} · {s.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div
            className={cn(
              "space-y-2 rounded-md px-3 py-2 text-sm",
              bShort ? "bg-red-50 text-red-700" : "bg-paper-200"
            )}
          >
            {bTypeObj ? (
              <>
                <p>
                  {bTargets} seller{bTargets === 1 ? "" : "s"} × {bQtyN} = <b>{bNeed}</b>{" "}
                  boxes needed · {bTypeObj.name} has <b>{bLeft}</b> unassigned
                  {bShort && ` — short by ${bNeed - bLeft}.`}
                </p>
                {bShort && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => addStock(bTypeObj, bNeed - bLeft)}
                      className="btn-secondary min-h-[36px] px-3 text-xs"
                    >
                      Add {bNeed - bLeft} to {bTypeObj.name} stock
                    </button>
                    <span className="text-xs">or lower the number.</span>
                  </div>
                )}
              </>
            ) : (
              "Pick a box type to see the stock check."
            )}
          </div>

          <p className="text-xs text-ink-faint">
            Adds to what each seller already holds. All-or-nothing: if stock
            can&apos;t cover everyone, nobody is assigned. A role assignment covers
            today&apos;s accounts only; run it again for accounts added later.
          </p>
          <button disabled={busy || !bReady} type="submit" className="btn-primary w-full">
            Assign {bReady ? `${bNeed} boxes` : ""}
          </button>
        </form>
      </Card>
    </div>
  );
}
