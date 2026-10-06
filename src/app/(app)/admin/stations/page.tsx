"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Card,
  ErrorBanner,
  PageTitle,
  StationStatusChip,
  SuccessBanner,
} from "@/components/ui";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { supabaseBrowser } from "@/lib/supabase/client";
import { RISK_TIER_META, type RiskTier, type Station, type StationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const OTHER_BLOCK = "__other__";
const DEFAULT_BLOCKS = ["A4", "A5", "B1", "Courts"];

type DayFilter = "all" | 1 | 2;

interface StationForm {
  name: string;
  day: 1 | 2;
  block: string; // a known block, or OTHER_BLOCK
  otherBlock: string;
  floor: string;
  risk: RiskTier;
}

const EMPTY_FORM: StationForm = {
  name: "",
  day: 1,
  block: "",
  otherBlock: "",
  floor: "",
  risk: "low",
};

interface StationGm {
  id: string;
  full_name: string;
  station_id: number;
}

// stations.code is the location: block and floor, e.g. "A4-1".
function locationCode(block: string, floor: string) {
  const f = floor.trim();
  return f ? `${block}-${f}` : block;
}

// FR-11.3: station management (count/IDs still open per D-2 — fully
// editable here without redeploy). Groups and their tokens are managed on
// the Token page (/admin/token).
export default function AdminStationsPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [stations, setStations] = useState<Station[]>([]);
  const [gms, setGms] = useState<StationGm[]>([]);
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  // null = closed; "new" = adding; a station = editing it
  const [editing, setEditing] = useState<Station | "new" | null>(null);
  const [form, setForm] = useState<StationForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: sts }, { data: staff }] = await Promise.all([
      supabase.from("stations").select("*").order("day").order("id"),
      supabase
        .from("profiles")
        .select("id, full_name, station_id")
        .in("role", ["gm", "guardian_gm"])
        .not("station_id", "is", null),
    ]);
    setStations((sts as Station[]) ?? []);
    setGms((staff as StationGm[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const blocks = useMemo(
    () => Array.from(new Set([...DEFAULT_BLOCKS, ...stations.map((s) => s.area)])).filter(Boolean),
    [stations]
  );

  const visible = stations.filter((s) => dayFilter === "all" || s.day === dayFilter);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2000);
  }

  function openAdd() {
    setForm({ ...EMPTY_FORM, day: dayFilter === 2 ? 2 : 1 });
    setEditing("new");
  }

  function openEdit(s: Station) {
    const known = blocks.includes(s.area);
    setForm({
      name: s.name,
      day: s.day,
      block: known ? s.area : OTHER_BLOCK,
      otherBlock: known ? "" : s.area,
      floor: s.code.startsWith(`${s.area}-`) ? s.code.slice(s.area.length + 1) : "",
      risk: s.risk_tier,
    });
    setEditing(s);
  }

  async function saveStation(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const block = (form.block === OTHER_BLOCK ? form.otherBlock : form.block).trim();
    if (!block) return setError("Choose a block.");

    const row: Partial<Station> = {
      name: form.name.trim(),
      day: form.day,
      area: block,
      // Day 1 has no entry fee; keep the column at its default
      risk_tier: form.day === 2 ? form.risk : "low",
    };
    // Keep an existing code that doesn't follow block-floor unless the location changed
    const old = editing !== "new" ? editing : null;
    const oldFloor = old?.code.startsWith(`${old.area}-`) ? old.code.slice(old.area.length + 1) : "";
    if (!old || old.area !== block || oldFloor !== form.floor.trim()) {
      row.code = locationCode(block, form.floor);
    }

    const { error } = old
      ? await supabase.from("stations").update(row).eq("id", old.id)
      : await supabase.from("stations").insert(row);
    if (error) return setError(error.message);
    setEditing(null);
    flash(old ? "Station updated." : "Station added.");
    load();
  }

  async function setStatus(id: number, status: StationStatus) {
    const { error } = await supabase.from("stations").update({ status }).eq("id", id);
    if (error) setError(error.message);
    else setStations((sts) => sts.map((s) => (s.id === id ? { ...s, status } : s)));
  }

  async function deleteStation(s: Station) {
    setError(null);
    // Stations with token history keep their records; close them instead.
    const [{ count: txCount }, { count: logCount }] = await Promise.all([
      supabase
        .from("token_transactions")
        .select("id", { count: "exact", head: true })
        .eq("station_id", s.id),
      supabase
        .from("token_logs")
        .select("log_id", { count: "exact", head: true })
        .eq("station_id", s.id),
    ]);
    if ((txCount ?? 0) + (logCount ?? 0) > 0) {
      if (
        s.status !== "closed" &&
        window.confirm(
          `${s.name} already has token history, so it can't be deleted.\n\nClose it instead?`
        )
      ) {
        await setStatus(s.id, "closed");
        flash("Station closed.");
      } else if (s.status === "closed") {
        setError(`${s.name} has token history, so it stays (closed).`);
      }
      return;
    }

    const assigned = gms.filter((g) => g.station_id === s.id);
    const warning = assigned.length
      ? `\n\nThese GMs will have no station: ${assigned.map((g) => g.full_name).join(", ")}.`
      : "";
    if (!window.confirm(`Delete ${s.name}?${warning}`)) return;
    const { error } = await supabase.from("stations").delete().eq("id", s.id);
    if (error) setError(error.message);
    else {
      flash("Station deleted.");
      load();
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Stations"
        action={
          <button type="button" className="btn-primary px-5" onClick={openAdd}>
            + Add station
          </button>
        }
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <section>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold">Stations ({visible.length})</h2>
            <p className="text-sm text-ink-faint">
              Status follows the game: a day&apos;s stations open when its game
              starts in{" "}
              <Link href="/admin" className="font-semibold underline">
                Live control
              </Link>{" "}
              and close when it ends. Day 2 entry cost follows the risk tier (set
              on the{" "}
              <Link href="/admin/token" className="font-semibold underline">
                Token page
              </Link>
              ).
            </p>
          </div>
          <div className="flex gap-1 rounded-xl bg-paper-200 p-1" role="tablist" aria-label="Filter by day">
            {(["all", 1, 2] as DayFilter[]).map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={dayFilter === d}
                onClick={() => setDayFilter(d)}
                className={cn(
                  "min-h-[34px] rounded-lg px-3 text-sm font-bold",
                  dayFilter === d ? "bg-white text-ink shadow-card" : "text-ink-faint"
                )}
              >
                {d === "all" ? "All" : `Day ${d}`}
              </button>
            ))}
          </div>
        </div>

        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-paper-200 text-xs font-bold uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3">Station</th>
                <th className="w-16 px-4 py-3">Day</th>
                <th className="w-32 px-4 py-3">Status</th>
                <th className="w-28 px-4 py-3">Risk</th>
                <th className="w-20 px-4 py-3">Entry</th>
                <th className="w-44 px-4 py-3">GMs</th>
                <th className="w-20 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-200">
              {visible.map((s) => {
                const assigned = gms.filter((g) => g.station_id === s.id);
                return (
                  <tr key={s.id}>
                    <td className="max-w-0 px-4 py-2.5">
                      <p className="truncate font-semibold">{s.name}</p>
                      <p className="truncate text-xs text-ink-faint">{s.code}</p>
                    </td>
                    <td className="px-4 py-2.5 font-bold">{s.day}</td>
                    <td className="px-4 py-2.5">
                      <StationStatusChip status={s.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      {s.day === 2 ? RISK_TIER_META[s.risk_tier].label : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-bold tabular-nums">
                      {s.day === 2 ? `−${s.entry_cost}` : "—"}
                    </td>
                    <td className="max-w-0 px-4 py-2.5">
                      {assigned.length ? (
                        <p className="truncate" title={assigned.map((g) => g.full_name).join(", ")}>
                          {assigned.map((g) => g.full_name).join(", ")}
                        </p>
                      ) : (
                        <span className="text-ink-faint">None</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openEdit(s)}
                          className="text-ink-soft hover:text-ink"
                          aria-label={`Edit ${s.name}`}
                        >
                          <Pencil size={16} strokeWidth={1.75} />
                        </button>
                        <button
                          onClick={() => deleteStation(s)}
                          className="text-red-500"
                          aria-label={`Delete ${s.name}`}
                        >
                          <Trash2 size={16} strokeWidth={1.75} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-faint">
                    No stations yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent title={editing === "new" ? "Add station" : "Edit station"}>
          <form onSubmit={saveStation} className="space-y-3">
            <div>
              <label className="label" htmlFor="station-name">
                Station name
              </label>
              <input
                id="station-name"
                className="input text-sm"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div>
              <span className="label">Day</span>
              <div className="grid grid-cols-2 gap-2">
                {([1, 2] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setForm({ ...form, day: d })}
                    aria-pressed={form.day === d}
                    className={cn(
                      "btn min-h-[44px] text-sm",
                      form.day === d ? "bg-ink text-white" : "border border-paper-300 bg-white"
                    )}
                  >
                    Day {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor="station-block">
                  Block
                </label>
                <select
                  id="station-block"
                  className="input text-sm"
                  required
                  value={form.block}
                  onChange={(e) => setForm({ ...form, block: e.target.value })}
                >
                  <option value="">Choose…</option>
                  {blocks.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                  <option value={OTHER_BLOCK}>Other…</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="station-floor">
                  Floor
                </label>
                <input
                  id="station-floor"
                  className="input text-sm"
                  placeholder="e.g. 1, G"
                  value={form.floor}
                  onChange={(e) => setForm({ ...form, floor: e.target.value })}
                />
              </div>
            </div>
            {form.block === OTHER_BLOCK && (
              <input
                className="input text-sm"
                placeholder="New block name"
                aria-label="New block name"
                required
                value={form.otherBlock}
                onChange={(e) => setForm({ ...form, otherBlock: e.target.value })}
              />
            )}

            {form.day === 2 && (
              <div>
                <span className="label">Risk</span>
                <div className="grid grid-cols-3 gap-2">
                  {(["low", "medium", "high"] as RiskTier[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setForm({ ...form, risk: r })}
                      aria-pressed={form.risk === r}
                      className={cn(
                        "btn min-h-[44px] text-sm",
                        form.risk === r ? "bg-ink text-white" : "border border-paper-300 bg-white"
                      )}
                    >
                      {RISK_TIER_META[r].label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button type="submit" className="btn-primary w-full">
              {editing === "new" ? "Add station" : "Save changes"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
