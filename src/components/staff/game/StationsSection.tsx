"use client";

import { Check, ChevronDown, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { usePhases } from "@/components/PhaseTimerProvider";
import { useStationOccupants, type Occupant } from "@/components/staff/useStationOccupants";
import { MAP_BUILDINGS, stationPosition } from "@/lib/mapBuildings";
import { supabaseBrowser } from "@/lib/supabase/client";
import { RISK_TIER_META, type RiskTier, type Station, type StationStatus } from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

import { ConfirmSheet, FoldBody, Sheet, StatusLine, useStatus } from "./parts";

// Admin → Stations for HOGM, as folding cards: closed shows the name and
// status; open shows the details, status, Game Masters, edit and delete.
// Same writes as the Admin page (stations table, fn_admin_set_station_gms);
// status goes through fn_set_station_status like Live control's override. A
// station shows the group playing there (a GM's Day 2 Start checks it in);
// Clear checks out a group a GM's phone could not (useStationOccupants).

const OTHER_BLOCK = "__other__";
const DEFAULT_BLOCKS = [...MAP_BUILDINGS.map((b) => b.area), "Courts"];
const STATUS: { value: StationStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "in_progress", label: "Busy" },
  { value: "closed", label: "Closed" },
];
const STATUS_TONE: Record<StationStatus, string> = { available: "ok", in_progress: "warn", closed: "off" };

type Day = 1 | 2;
type GmUser = { id: string; full_name: string };
type GmAssignment = { user_id: string; station_id: number; day: number };
type Form = {
  name: string;
  day: 1 | 2;
  block: string;
  otherBlock: string;
  floor: string;
  risk: RiskTier;
  purpose: string;
  max_groups: string;
};

const EMPTY: Form = { name: "", day: 1, block: "", otherBlock: "", floor: "", risk: "low", purpose: "", max_groups: "" };

// stations.code is the location: block and floor, e.g. "A4-1".
const locationCode = (block: string, floor: string) => (floor.trim() ? `${block}-${floor.trim()}` : block);
const floorOf = (s: Station) => (s.code.startsWith(`${s.area}-`) ? s.code.slice(s.area.length + 1) : "");

export function StationsSection() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { error, setError, notice, flash } = useStatus();
  const occupants = useStationOccupants();
  const [clearing, setClearing] = useState<{ station: Station; occupant: Occupant } | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [gmUsers, setGmUsers] = useState<GmUser[]>([]);
  const [assignments, setAssignments] = useState<GmAssignment[]>([]);
  // Day 1 or Day 2 (no "All", Ben). Until one is picked, the day whose game runs (Day 2 for the endgame too).
  const { phases } = usePhases();
  const [pickedDay, setPickedDay] = useState<Day | null>(null);
  const live = phases.find((p) => p.state === "active" || p.state === "paused");
  const dayFilter: Day = pickedDay ?? (live && (live.key === "day2" || live.is_endgame) ? 2 : 1);
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Station | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [gmStation, setGmStation] = useState<Station | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [gmSearch, setGmSearch] = useState("");
  const [deleting, setDeleting] = useState<{ station: Station; hasHistory: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: sts }, { data: staff }, { data: asg, error: asgError }] = await Promise.all([
      supabase.from("stations").select("*").order("day").order("id"),
      supabase.from("profiles").select("id, full_name").in("role", ["gm", "guardian_gm"]).order("full_name"),
      supabase.rpc("fn_admin_station_gms"),
    ]);
    setStations((sts as Station[]) ?? []);
    setGmUsers((staff as GmUser[]) ?? []);
    setAssignments((asg as GmAssignment[]) ?? []);
    if (asgError) setError(friendlyError(asgError));
  }, [supabase, setError]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`gc-stations-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stations" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  const blocks = useMemo(
    () => Array.from(new Set([...DEFAULT_BLOCKS, ...stations.map((s) => s.area)])).filter(Boolean),
    [stations]
  );
  const visible = stations.filter((s) => s.day === dayFilter);
  const gmName = (id: string) => gmUsers.find((g) => g.id === id)?.full_name || "Unnamed";
  const gmsOf = (stationId: number) =>
    assignments
      .filter((a) => a.station_id === stationId && gmUsers.some((g) => g.id === a.user_id))
      .map((a) => ({ id: a.user_id, name: gmName(a.user_id) }));
  const elsewhere = (userId: string, s: Station) => {
    const at = assignments.find((a) => a.user_id === userId && a.day === s.day && a.station_id !== s.id);
    return at ? (stations.find((x) => x.id === at.station_id)?.name ?? "another station") : null;
  };

  async function confirmClear() {
    if (!clearing) return;
    const { station: s, occupant: o } = clearing;
    setBusy(true);
    const message = await occupants.clear(o.groupId);
    setBusy(false);
    setClearing(null);
    if (message) setError(message);
    else flash(`${o.name} cleared from ${s.name}`);
  }

  async function setStatus(s: Station, status: StationStatus) {
    const { error } = await supabase.rpc("fn_set_station_status", { p_station_id: s.id, p_status: status });
    if (error) return setError(friendlyError(error));
    setStations((all) => all.map((x) => (x.id === s.id ? { ...x, status } : x)));
    flash(`${s.name}: ${STATUS.find((x) => x.value === status)?.label}`);
  }

  function openAdd() {
    setForm({ ...EMPTY, day: dayFilter, block: blocks[0] ?? "A1" });
    setEditing("new");
  }

  function openEdit(s: Station) {
    const known = blocks.includes(s.area);
    setForm({
      name: s.name,
      day: s.day,
      block: known ? s.area : OTHER_BLOCK,
      otherBlock: known ? "" : s.area,
      floor: floorOf(s),
      risk: s.risk_tier,
      purpose: s.purpose ?? "",
      max_groups: s.max_groups != null ? String(s.max_groups) : "",
    });
    setEditing(s);
  }

  async function saveStation(e: React.FormEvent) {
    e.preventDefault();
    const block = (form.block === OTHER_BLOCK ? form.otherBlock : form.block).trim();
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
    const old = editing !== "new" ? editing : null;
    // Keep an existing code that doesn't follow block-floor unless the location changed
    if (!old || old.area !== block || floorOf(old) !== form.floor.trim()) row.code = locationCode(block, form.floor);
    if (!old) {
      const spot = stationPosition(block, stations.filter((s) => s.area === block).length) ?? { x: 50, y: 50 };
      row.map_x = spot.x;
      row.map_y = spot.y;
    }
    setBusy(true);
    const { error } = old
      ? await supabase.from("stations").update(row).eq("id", old.id)
      : await supabase.from("stations").insert(row);
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setEditing(null);
    flash(old ? "Station saved" : "Station added");
    load();
  }

  function openGms(s: Station) {
    setPicked(gmsOf(s.id).map((g) => g.id));
    setGmSearch("");
    setGmStation(s);
  }

  async function saveGms() {
    if (!gmStation) return;
    setBusy(true);
    const { error } = await supabase.rpc("fn_admin_set_station_gms", { p_station_id: gmStation.id, p_user_ids: picked });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    flash(`${gmStation.name}: Game Masters saved`);
    setGmStation(null);
    load();
  }

  // Stations with token history keep their records; they can only be closed.
  async function askDelete(s: Station) {
    const [{ count: tx }, { count: logs }] = await Promise.all([
      supabase.from("token_transactions").select("id", { count: "exact", head: true }).eq("station_id", s.id),
      supabase.from("token_logs").select("log_id", { count: "exact", head: true }).eq("station_id", s.id),
    ]);
    setDeleting({ station: s, hasHistory: (tx ?? 0) + (logs ?? 0) > 0 });
  }

  async function confirmDelete() {
    if (!deleting) return;
    const { station: s, hasHistory } = deleting;
    setBusy(true);
    if (hasHistory) {
      await setStatus(s, "closed");
    } else {
      const { error } = await supabase.from("stations").delete().eq("id", s.id);
      if (error) setError(friendlyError(error));
      else {
        flash(`${s.name} deleted`);
        setOpenId(null);
        load();
      }
    }
    setBusy(false);
    setDeleting(null);
  }

  return (
    <div className="gc-stack">
      <div className="gc-toolbar">
        <div className="gc-seg" role="tablist" aria-label="Day">
          {([1, 2] as Day[]).map((d) => (
            <button key={d} type="button" role="tab" aria-selected={dayFilter === d} onClick={() => setPickedDay(d)}>
              Day {d}
            </button>
          ))}
        </div>
        <button type="button" className="gc-btn gc-btn-primary" onClick={openAdd}>
          <Plus size={16} aria-hidden /> Add
        </button>
      </div>
      <StatusLine error={error} notice={notice} />

      <ul className="gc-list">
        {visible.map((s) => {
          const open = openId === s.id;
          const gms = gmsOf(s.id);
          const here = occupants.byStation[s.id] ?? [];
          return (
            <li key={s.id} className="gc-card gc-fold" data-open={open || undefined}>
              <button
                type="button"
                className="gc-fold-head"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : s.id)}
              >
                <span className="gc-fold-name">
                  {s.name}
                  {here.length > 0 && <small className="gc-fold-here">{here.map((o) => o.name).join(", ")} here</small>}
                </span>
                <span className="gc-chip" data-tone={STATUS_TONE[s.status]}>
                  {STATUS.find((x) => x.value === s.status)?.label}
                </span>
                <ChevronDown size={18} aria-hidden className="gc-fold-chev" />
              </button>
              <FoldBody open={open}>
                <div className="gc-fold-body">
                  <dl className="gc-facts">
                    <div><dt>Location</dt><dd>{s.code}</dd></div>
                    <div><dt>Game</dt><dd>{s.purpose || "—"}</dd></div>
                    <div><dt>Groups at Once</dt><dd>{s.max_groups ?? "—"}</dd></div>
                    {s.day === 2 && (
                      <div><dt>Risk &amp; Entry</dt><dd>{RISK_TIER_META[s.risk_tier].label} / −{s.entry_cost}</dd></div>
                    )}
                  </dl>
                  <div className="gc-seg gc-seg-status" role="group" aria-label={`${s.name} status`}>
                    {STATUS.map((x) => (
                      <button
                        key={x.value}
                        type="button"
                        aria-pressed={s.status === x.value}
                        data-tone={STATUS_TONE[x.value]}
                        onClick={() => s.status !== x.value && setStatus(s, x.value)}
                      >
                        {x.label}
                      </button>
                    ))}
                  </div>
                  {here.map((o) => (
                    <div key={o.groupId} className="gc-here">
                      <span>
                        <b>{o.name}</b> is here
                      </span>
                      <button type="button" className="gc-btn gc-btn-danger" onClick={() => setClearing({ station: s, occupant: o })}>
                        Clear
                      </button>
                    </div>
                  ))}
                  <button type="button" className="gc-gms" onClick={() => openGms(s)}>
                    <Users size={16} aria-hidden />
                    <span>{gms.length ? gms.map((g) => g.name).join(", ") : "No Game Master yet"}</span>
                    <b>Edit</b>
                  </button>
                  <div className="gc-row2">
                    <button type="button" className="gc-btn" onClick={() => openEdit(s)}>
                      <Pencil size={15} aria-hidden /> Edit
                    </button>
                    <button type="button" className="gc-btn gc-btn-danger" onClick={() => askDelete(s)}>
                      <Trash2 size={15} aria-hidden /> Delete
                    </button>
                  </div>
                </div>
              </FoldBody>
            </li>
          );
        })}
        {visible.length === 0 && <li className="gc-empty">No stations yet.</li>}
      </ul>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add Station" : "Edit Station"}>
        <form className="gc-form" onSubmit={saveStation}>
          <label className="gc-field">
            <span>Name</span>
            <input className="gc-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <div className="gc-field">
            <span>Day</span>
            <div className="gc-seg">
              {([1, 2] as const).map((d) => (
                <button key={d} type="button" aria-pressed={form.day === d} onClick={() => setForm({ ...form, day: d })}>
                  Day {d}
                </button>
              ))}
            </div>
          </div>
          <div className="gc-row2">
            <label className="gc-field">
              <span>Block</span>
              <select className="gc-input" required value={form.block} onChange={(e) => setForm({ ...form, block: e.target.value })}>
                <option value="">Choose…</option>
                {blocks.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
                <option value={OTHER_BLOCK}>Other…</option>
              </select>
            </label>
            <label className="gc-field">
              <span>Floor</span>
              <input className="gc-input" placeholder="1, G" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
            </label>
          </div>
          {form.block === OTHER_BLOCK && (
            <label className="gc-field">
              <span>New Block Name</span>
              <input className="gc-input" required value={form.otherBlock} onChange={(e) => setForm({ ...form, otherBlock: e.target.value })} />
            </label>
          )}
          <label className="gc-field">
            <span>Game</span>
            <input className="gc-input" placeholder="Tug of War" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
          </label>
          <label className="gc-field">
            <span>Groups at Once</span>
            <input
              className="gc-input"
              type="number"
              inputMode="numeric"
              min="1"
              value={form.max_groups}
              onChange={(e) => setForm({ ...form, max_groups: e.target.value })}
            />
          </label>
          {form.day === 2 && (
            <div className="gc-field">
              <span>Risk</span>
              <div className="gc-seg">
                {(["low", "medium", "high"] as RiskTier[]).map((r) => (
                  <button key={r} type="button" aria-pressed={form.risk === r} onClick={() => setForm({ ...form, risk: r })}>
                    {RISK_TIER_META[r].label.replace(" Risk", "")}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button type="submit" className="gc-btn gc-btn-primary" disabled={busy}>
            {editing === "new" ? "Add Station" : "Save"}
          </button>
        </form>
      </Sheet>

      <Sheet open={gmStation !== null} onClose={() => setGmStation(null)} title={gmStation ? `Game Masters / ${gmStation.name}` : "Game Masters"}>
        {gmStation && (
          <div className="gc-form">
            <input
              className="gc-input"
              placeholder="Search"
              aria-label="Search Game Masters"
              value={gmSearch}
              onChange={(e) => setGmSearch(e.target.value)}
            />
            <ul className="gc-picks">
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
                    <li key={g.id}>
                      <label className={cn("gc-pick", at && !on && "is-elsewhere")}>
                        <input
                          type="checkbox"
                          className="gc-sr"
                          checked={on}
                          onChange={() => setPicked((cur) => (on ? cur.filter((id) => id !== g.id) : [...cur, g.id]))}
                        />
                        <span className="gc-box" aria-hidden>{on && <Check size={14} />}</span>
                        <span className="gc-pick-name">{g.full_name || "Unnamed"}</span>
                        {at && <small>{on ? `moves from ${at}` : `at ${at}`}</small>}
                      </label>
                    </li>
                  );
                })}
              {gmUsers.length === 0 && <li className="gc-empty">No Game Masters yet.</li>}
            </ul>
            <button type="button" className="gc-btn gc-btn-primary" disabled={busy} onClick={saveGms}>
              Save ({picked.length} selected)
            </button>
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={clearing !== null}
        onClose={() => setClearing(null)}
        onConfirm={confirmClear}
        busy={busy}
        danger
        title={clearing ? `Clear ${clearing.occupant.name}?` : "Clear Group?"}
        confirmLabel="Clear"
        body={
          clearing
            ? `${clearing.occupant.name} leaves ${clearing.station.name} on every map. Use this when a game has ended but the Game Master's phone could not clear it (no battery, no network). If the station still says In progress, set its status above.`
            : ""
        }
      />

      <ConfirmSheet
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        busy={busy}
        danger
        title={deleting?.hasHistory ? `Close ${deleting.station.name}?` : `Delete ${deleting?.station.name ?? ""}?`}
        confirmLabel={deleting?.hasHistory ? "Close Station" : "Delete"}
        body={
          deleting?.hasHistory
            ? "It has token history, so it can't be deleted. Closing keeps the records."
            : `Groups checked in here lose that check-in.${
                deleting && gmsOf(deleting.station.id).length
                  ? ` ${gmsOf(deleting.station.id).map((g) => g.name).join(", ")} will have no station.`
                  : ""
              }`
        }
      />
    </div>
  );
}
