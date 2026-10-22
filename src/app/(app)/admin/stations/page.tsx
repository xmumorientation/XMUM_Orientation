"use client";

import { Check, Pencil, Trash2 } from "lucide-react";
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
import { readAdminDayFilter } from "@/lib/adminDayFilter";
import {
  MAP_BUILDINGS,
  stationCodePrefix,
  stationPosition,
} from "@/lib/mapBuildings";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  RISK_TIER_META,
  type RiskTier,
  type Station,
  type StationStatus,
} from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

const OTHER_BLOCK = "__other__";
const DEFAULT_BLOCKS: string[] = MAP_BUILDINGS.map((b) => b.area);

type DayFilter = "all" | 1 | 2;

interface StationForm {
  name: string;
  day: 1 | 2;
  block: string; // a known block, or OTHER_BLOCK
  otherBlock: string;
  floor: string;
  risk: RiskTier;
  purpose: string;
  max_groups: string;
}

const EMPTY_FORM: StationForm = {
  name: "",
  day: 1,
  block: "",
  otherBlock: "",
  floor: "",
  risk: "low",
  purpose: "",
  max_groups: "",
};

interface GmUser {
  id: string;
  full_name: string;
}

// One row per GM per day (gm_station_assignments).
interface GmAssignment {
  user_id: string;
  station_id: number;
  day: number;
}

// stations.code is the location: block and floor, e.g. "A4-1" or "TC-1".
function locationCode(block: string, floor: string) {
  const prefix = stationCodePrefix(block);
  const f = floor.trim();
  return f ? `${prefix}-${f}` : prefix;
}

/** The floor part of a code, for either the short ("TF-1") or long ("Track & Field-1") form. */
function codeFloor(code: string, area: string) {
  for (const prefix of [stationCodePrefix(area), area]) {
    if (code.startsWith(`${prefix}-`)) return code.slice(prefix.length + 1);
  }
  return "";
}

// FR-11.3: station management (count/IDs still open per D-2 — fully
// editable here without redeploy). Groups and their tokens are managed on
// the Token page (/admin/token).
export default function AdminStationsPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [stations, setStations] = useState<Station[]>([]);
  const [gmUsers, setGmUsers] = useState<GmUser[]>([]);
  const [assignments, setAssignments] = useState<GmAssignment[]>([]);
  // Tick-and-save dialog for one station's Game Masters
  const [gmStation, setGmStation] = useState<Station | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [gmSearch, setGmSearch] = useState("");
  const [gmSaving, setGmSaving] = useState(false);
  // Starts on Live control's Day filter.
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  // null = closed; "new" = adding; a station = editing it
  const [editing, setEditing] = useState<Station | "new" | null>(null);
  const [form, setForm] = useState<StationForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: sts }, { data: staff }, { data: asg }] = await Promise.all([
      supabase.from("stations").select("*").order("day").order("id"),
      supabase
        .from("profiles")
        .select("id, full_name")
        .in("role", ["gm", "guardian_gm"])
        .order("full_name"),
      supabase.rpc("fn_admin_station_gms"),
    ]);
    setStations((sts as Station[]) ?? []);
    setGmUsers((staff as GmUser[]) ?? []);
    setAssignments((asg as GmAssignment[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
    const saved = readAdminDayFilter();
    if (saved) setDayFilter(saved === "all" ? "all" : saved === "Day 1" ? 1 : 2);
  }, [load]);

  // A Game Master (or another Admin) changes a status: it shows here at once.
  // Only the status is merged, so a dialog being edited is not disturbed.
  useEffect(() => {
    const channel = supabase
      .channel(`admin-stations-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stations" }, (payload) => {
        if (payload.eventType === "UPDATE") {
          const row = payload.new as Station;
          setStations((sts) => sts.map((s) => (s.id === row.id ? { ...s, status: row.status } : s)));
        } else {
          load();
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  const blocks = useMemo(
    () =>
      Array.from(
        new Set([...DEFAULT_BLOCKS, ...stations.map((s) => s.area)])
      ).filter(Boolean),
    [stations]
  );

  const visible = stations.filter(
    (s) => dayFilter === "all" || s.day === dayFilter
  );

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2000);
  }

  const gmName = (id: string) => gmUsers.find((g) => g.id === id)?.full_name || "Unnamed";

  // Names of the GMs on a station (only users who are still GMs).
  function gmsOf(stationId: number) {
    return assignments
      .filter((a) => a.station_id === stationId && gmUsers.some((g) => g.id === a.user_id))
      .map((a) => ({ id: a.user_id, name: gmName(a.user_id) }));
  }

  function openGmDialog(s: Station) {
    setPicked(gmsOf(s.id).map((g) => g.id));
    setGmSearch("");
    setGmStation(s);
  }

  // Where a GM already works on the given station's day (another station only).
  function elsewhere(userId: string, s: Station) {
    const at = assignments.find((a) => a.user_id === userId && a.day === s.day && a.station_id !== s.id);
    return at ? (stations.find((x) => x.id === at.station_id)?.name ?? "another station") : null;
  }

  async function saveGms() {
    if (!gmStation) return;
    setGmSaving(true);
    setError(null);
    const { error } = await supabase.rpc("fn_admin_set_station_gms", {
      p_station_id: gmStation.id,
      p_user_ids: picked,
    });
    setGmSaving(false);
    if (error) return setError(friendlyError(error));
    flash(`${gmStation.name}: Game Masters saved.`);
    setGmStation(null);
    load();
  }

  function openAdd() {
    setForm({
      ...EMPTY_FORM,
      day: dayFilter === 2 ? 2 : 1,
      block: blocks[0] ?? "A1",
    });
    setEditing("new");
  }

  function openEdit(s: Station) {
    const known = blocks.includes(s.area);
    setForm({
      name: s.name,
      day: s.day,
      block: known ? s.area : OTHER_BLOCK,
      otherBlock: known ? "" : s.area,
      floor: codeFloor(s.code, s.area),
      risk: s.risk_tier,
      purpose: s.purpose ?? "",
      max_groups: s.max_groups != null ? String(s.max_groups) : "",
    });
    setEditing(s);
  }

  async function saveStation(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const block = (
      form.block === OTHER_BLOCK ? form.otherBlock : form.block
    ).trim();
    if (!block) return setError("Choose a block.");

    const row: Partial<Station> = {
      name: form.name.trim(),
      day: form.day,
      area: block,
      // Day 1 has no entry fee; keep the column at its default
      risk_tier: form.day === 2 ? form.risk : "low",
      purpose: form.purpose.trim(),
      max_groups: form.max_groups ? parseInt(form.max_groups, 10) : null,
    };

    // Keep an existing code that doesn't follow block-floor unless the location changed
    const old = editing !== "new" ? editing : null;
    const oldFloor = old ? codeFloor(old.code, old.area) : "";
    if (!old || old.area !== block || oldFloor !== form.floor.trim()) {
      row.code = locationCode(block, form.floor);
    }

    if (!old) {
      const spot = stationPosition(
        block,
        stations.filter((s) => s.area === block).length
      ) ?? { x: 50, y: 50 };
      row.map_x = spot.x;
      row.map_y = spot.y;
    }

    const { error } = old
      ? await supabase.from("stations").update(row).eq("id", old.id)
      : await supabase.from("stations").insert(row);
    if (error) return setError(error.message);
    setEditing(null);
    flash(old ? "Station updated." : "Station added.");
    load();
  }

  // Status is manual: Admin sets it here, a Game Master sets their own
  // station's. Same server function for both (it checks the role).
  async function setStatus(id: number, status: StationStatus) {
    setError(null);
    const { error } = await supabase.rpc("fn_set_station_status", {
      p_station_id: id,
      p_status: status,
    });
    if (error) setError(friendlyError(error));
    else
      setStations((sts) =>
        sts.map((s) => (s.id === id ? { ...s, status } : s))
      );
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

    const assigned = gmsOf(s.id);
    const warning = assigned.length
      ? `\n\nThese GMs will have no station: ${assigned
          .map((g) => g.name)
          .join(", ")}.`
      : "";
    if (!window.confirm(`Delete ${s.name}?${warning}

Groups checked in here will lose that check-in.`)) return;
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

          <div
            role="tablist"
            aria-label="Filter stations by day"
            className="flex rounded-xl border border-paper-300 bg-paper-200 p-1"
          >
            {(["all", 1, 2] as DayFilter[]).map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={dayFilter === d}
                onClick={() => setDayFilter(d)}
                className={cn(
                  "min-h-[34px] rounded-lg px-3 text-sm font-bold",
                  dayFilter === d
                    ? "bg-[#25405e] text-white shadow-card"
                    : "text-ink-faint hover:text-white"
                )}
              >
                {d === "all" ? "All" : `Day ${d}`}
              </button>
            ))}
          </div>
        </div>

        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-paper-200 text-xs font-bold uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3">Station</th>
                <th className="w-16 px-4 py-3">Day</th>
                <th className="w-32 px-4 py-3">Status</th>
                <th className="w-28 px-4 py-3">Risk</th>
                <th className="w-20 px-4 py-3">Entry</th>
                <th className="w-64 px-4 py-3">Game Master</th>
                <th className="w-20 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-200">
              {visible.map((s) => {
                const assigned = gmsOf(s.id);
                return (
                  <tr key={s.id}>
                    <td className="max-w-0 px-4 py-2.5">
                      <p className="truncate font-semibold">{s.name}</p>
                      <p className="truncate text-xs text-ink-faint">
                        {s.code}
                        {s.purpose ? ` / ${s.purpose}` : ""}
                        {s.max_groups != null ? ` (max ${s.max_groups})` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 font-bold">{s.day}</td>
                    <td className="px-4 py-2.5">
                      <select
                        className="input min-h-[36px] w-36 text-sm"
                        aria-label={`${s.name} status`}
                        value={s.status}
                        onChange={(e) => setStatus(s.id, e.target.value as StationStatus)}
                      >
                        <option value="available">Available</option>
                        <option value="in_progress">In Progress</option>
                        <option value="closed">Closed</option>
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      {s.day === 2 ? RISK_TIER_META[s.risk_tier].label : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-bold tabular-nums">
                      {s.day === 2 ? `−${s.entry_cost}` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => openGmDialog(s)}
                        className="flex w-full flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-paper-300 px-2 py-1 text-left hover:border-ink-faint"
                        aria-label={`Edit Game Masters for ${s.name}`}
                      >
                        {assigned.length === 0 ? (
                          <span className="text-ink-faint">Unassigned / click to assign</span>
                        ) : (
                          assigned.map((g) => (
                            <span key={g.id} className="rounded-full bg-[#25405e] px-2.5 py-0.5 text-xs font-semibold text-white">
                              {g.name}
                            </span>
                          ))
                        )}
                      </button>
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
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-ink-faint"
                  >
                    No stations yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>

      <Dialog open={gmStation !== null} onOpenChange={(open) => !open && setGmStation(null)}>
        <DialogContent title={gmStation ? `Game Masters / ${gmStation.name} (Day ${gmStation.day})` : "Game Masters"}>
          {gmStation && (
            <div className="space-y-3">
              <input
                className="input text-sm"
                placeholder="Search Game Masters…"
                aria-label="Search Game Masters"
                value={gmSearch}
                onChange={(e) => setGmSearch(e.target.value)}
              />
              <div className="max-h-72 divide-y divide-paper-200 overflow-y-auto rounded-xl border border-paper-200">
                {[...gmUsers]
                  .filter((g) => (g.full_name || "Unnamed").toLowerCase().includes(gmSearch.trim().toLowerCase()))
                  .sort((a, b) => {
                    const rank = (id: string) => (picked.includes(id) ? 0 : elsewhere(id, gmStation) ? 2 : 1);
                    return rank(a.id) - rank(b.id) || a.full_name.localeCompare(b.full_name);
                  })
                  .map((g) => {
                    const on = picked.includes(g.id);
                    const at = elsewhere(g.id, gmStation);
                    return (
                      <label
                        key={g.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm",
                          at && !on && "opacity-70"
                        )}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={on}
                          onChange={() =>
                            setPicked((cur) => (on ? cur.filter((id) => id !== g.id) : [...cur, g.id]))
                          }
                        />
                        <span
                          aria-hidden
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                            on ? "border-[#25405e] bg-[#25405e] text-white" : "border-paper-300"
                          )}
                        >
                          {on && <Check size={14} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{g.full_name || "Unnamed"}</span>
                        {at && (
                          <span className="shrink-0 text-xs text-ink-faint">
                            {on ? `moves from ${at}` : `at ${at}`}
                          </span>
                        )}
                      </label>
                    );
                  })}
                {gmUsers.length === 0 && (
                  <p className="px-3 py-4 text-center text-sm text-ink-faint">
                    No Game Masters yet. Give a user the GM role in Settings → Users.
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-ink-faint">{picked.length} selected</span>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary px-4" onClick={() => setGmStation(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary px-5"
                    disabled={
                      gmSaving ||
                      (picked.length === gmsOf(gmStation.id).length &&
                        picked.every((id) => gmsOf(gmStation.id).some((g) => g.id === id)))
                    }
                    onClick={saveGms}
                  >
                    {gmSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent
          title={editing === "new" ? "Add station" : "Edit station"}
        >
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
                      form.day === d
                        ? "bg-ink text-white"
                        : "border border-paper-300 bg-white"
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
                  Block / Area
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
                onChange={(e) =>
                  setForm({ ...form, otherBlock: e.target.value })
                }
              />
            )}

            <div>
              <label className="label" htmlFor="station-purpose">
                Game or purpose
              </label>
              <input
                id="station-purpose"
                className="input text-sm"
                placeholder="e.g. Tug of War, Water Relay"
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              />
            </div>

            <div>
              <label className="label" htmlFor="station-max-groups">
                Groups at once (capacity)
              </label>
              <input
                id="station-max-groups"
                type="number"
                min="1"
                className="input text-sm"
                placeholder="How many groups fit (a full station refuses more check-ins)"
                value={form.max_groups}
                onChange={(e) =>
                  setForm({ ...form, max_groups: e.target.value })
                }
              />
            </div>

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
                        form.risk === r
                          ? "bg-ink text-white"
                          : "border border-paper-300 bg-white"
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
