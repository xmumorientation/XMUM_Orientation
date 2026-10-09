"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Card,
  ErrorBanner,
  PageTitle,
  StationStatusChip,
  SuccessBanner,
} from "@/components/ui";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import {
  MAP_BUILDINGS,
  nextStationCode,
  stationNumberFromCode,
  stationPosition,
} from "@/lib/mapBuildings";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";
import type {
  Group,
  RiskTier,
  Station,
  StationPurpose,
  StationStatus,
} from "@/lib/types";

type StationDraft = {
  id: number | null;
  code: string;
  name: string;
  area: string;
  purpose: string;
  newPurpose: string;
  status: StationStatus;
  risk_tier: RiskTier;
  entry_cost: number;
  max_groups: string;
  lat: string;
  lng: string;
  radius_m: string;
};

const EMPTY_DRAFT: StationDraft = {
  id: null,
  code: "",
  name: "",
  area: "A1",
  purpose: "",
  newPurpose: "",
  status: "available",
  risk_tier: "low",
  entry_cost: 2,
  max_groups: "",
  lat: "",
  lng: "",
  radius_m: "",
};

export default function AdminStationsPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [stations, setStations] = useState<Station[]>([]);
  const [purposes, setPurposes] = useState<StationPurpose[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [draft, setDraft] = useState<StationDraft>(EMPTY_DRAFT);
  const [stationOpen, setStationOpen] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [groupOpen, setGroupOpen] = useState(false);
  const [newPurpose, setNewPurpose] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: sts }, { data: ps }, { data: gs }, { data: cs }] = await Promise.all([
      supabase.from("stations").select("*").order("id"),
      supabase.from("station_purposes").select("id, name").order("name"),
      supabase.from("groups").select("*").order("id"),
      supabase.rpc("fn_station_group_counts"),
    ]);
    setCounts(
      Object.fromEntries(
        ((cs as { station_id: number; group_count: number }[]) ?? []).map((row) => [
          row.station_id,
          row.group_count,
        ])
      )
    );
    setStations((sts as Station[]) ?? []);
    setPurposes((ps as StationPurpose[]) ?? []);
    setGroups((gs as Group[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2000);
  }

  function openCreate() {
    setDraft(EMPTY_DRAFT);
    setStationOpen(true);
  }

  function openEdit(station: Station) {
    setDraft({
      id: station.id,
      code: station.code,
      name: station.name,
      area: station.area,
      purpose: station.purpose ?? "",
      newPurpose: "",
      status: station.status,
      risk_tier: station.risk_tier,
      entry_cost: station.entry_cost,
      max_groups: station.max_groups?.toString() ?? "",
      lat: station.lat?.toString() ?? "",
      lng: station.lng?.toString() ?? "",
      radius_m: station.radius_m?.toString() ?? "",
    });
    setStationOpen(true);
  }

  async function ensurePurpose(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return "";
    const { error: upsertError } = await supabase
      .from("station_purposes")
      .upsert({ name: trimmed }, { onConflict: "name", ignoreDuplicates: true });
    if (upsertError) throw new Error(upsertError.message);
    return trimmed;
  }

  async function saveStation(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const purposeName =
      draft.purpose === "__new" ? draft.newPurpose : draft.purpose;
    let purpose = "";
    try {
      purpose = await ensurePurpose(purposeName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the game.");
      return;
    }

    const siblings = stations.filter(
      (station) => station.area === draft.area && station.id !== draft.id
    );
    const spot = stationPosition(draft.area, siblings.length) ?? { x: 50, y: 50 };
    const code = draft.id
      ? draft.code
      : nextStationCode(
          draft.area,
          stations.map((station) => station.code)
        );
    const row = {
      code,
      station_number: stationNumberFromCode(code),
      name: draft.name.trim(),
      area: draft.area,
      purpose,
      risk_tier: draft.risk_tier,
      entry_cost: draft.entry_cost,
      map_x: spot.x,
      map_y: spot.y,
      max_groups: draft.max_groups ? Number(draft.max_groups) : null,
      lat: draft.lat ? Number(draft.lat) : null,
      lng: draft.lng ? Number(draft.lng) : null,
      radius_m: draft.radius_m ? Number(draft.radius_m) : null,
    };

    // Status is not part of the row: Available vs In progress follows the
    // groups checked in, and the manual choices go through fn_set_station_status.
    let stationId = draft.id;
    if (draft.id) {
      const { error: saveError } = await supabase
        .from("stations")
        .update(row)
        .eq("id", draft.id);
      if (saveError) {
        setError(saveError.message);
        return;
      }
    } else {
      const { data: created, error: saveError } = await supabase
        .from("stations")
        .insert(row)
        .select("id")
        .single();
      if (saveError || !created) {
        setError(saveError?.message ?? "Could not add the station.");
        return;
      }
      stationId = created.id as number;
    }

    const before = stations.find((station) => station.id === draft.id);
    if (stationId && (!before || before.status !== draft.status)) {
      const { error: statusError } = await supabase.rpc("fn_set_station_status", {
        p_station_id: stationId,
        p_status: draft.status,
      });
      if (statusError) {
        setError(friendlyError(statusError));
        load();
        return;
      }
    }
    setStationOpen(false);
    flash(draft.id ? "Station updated." : "Station added.");
    load();
  }

  async function updateStatus(id: number, status: StationStatus) {
    setError(null);
    const { error: updateError } = await supabase.rpc("fn_set_station_status", {
      p_station_id: id,
      p_status: status,
    });
    if (updateError) setError(friendlyError(updateError));
    load();
  }

  async function clearStation(station: Station) {
    if (!window.confirm(`Remove all groups from ${station.code}?`)) return;
    setError(null);
    const { error: clearError } = await supabase.rpc("fn_clear_station", {
      p_station_id: station.id,
    });
    if (clearError) setError(friendlyError(clearError));
    else flash("Station cleared.");
    load();
  }

  async function deleteStation(station: Station) {
    if (!window.confirm(`Delete ${station.code}?`)) return;
    setError(null);
    const { error: deleteError } = await supabase
      .from("stations")
      .delete()
      .eq("id", station.id);
    if (deleteError) setError(deleteError.message);
    else {
      flash("Station deleted.");
      load();
    }
  }

  async function addPurpose(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = newPurpose.trim();
    if (!name) return;
    const { error: insertError } = await supabase
      .from("station_purposes")
      .insert({ name });
    if (insertError) setError(insertError.message);
    else {
      setNewPurpose("");
      flash("Game added.");
      load();
    }
  }

  async function renamePurpose(purpose: StationPurpose, name: string) {
    const next = name.trim();
    if (!next || next === purpose.name) return;
    setError(null);
    const { error: updateError } = await supabase
      .from("station_purposes")
      .update({ name: next })
      .eq("id", purpose.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    const { error: stationError } = await supabase
      .from("stations")
      .update({ purpose: next })
      .eq("purpose", purpose.name);
    if (stationError) setError(stationError.message);
    else flash("Game updated.");
    load();
  }

  async function deletePurpose(purpose: StationPurpose) {
    const used = stations.some((station) => station.purpose === purpose.name);
    if (used) {
      setError("Reassign or clear this game on its stations before deleting it.");
      return;
    }
    if (!window.confirm(`Delete “${purpose.name}”?`)) return;
    const { error: deleteError } = await supabase
      .from("station_purposes")
      .delete()
      .eq("id", purpose.id);
    if (deleteError) setError(deleteError.message);
    else {
      flash("Game deleted.");
      load();
    }
  }

  async function addGroup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: insertError } = await supabase
      .from("groups")
      .insert({ name: newGroup });
    if (insertError) setError(insertError.message);
    else {
      setNewGroup("");
      setGroupOpen(false);
      flash("Group added.");
      load();
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Stations"
        subtitle="Place a station on A1–A5, B1, or Track & Field. Each one can have its own game and a status."
        action={
          <button type="button" className="btn-primary px-5" onClick={openCreate}>
            + Add station
          </button>
        }
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <section>
        <h2 className="mb-2 font-semibold">Stations ({stations.length})</h2>
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-paper-200 text-xs font-bold uppercase tracking-wide text-ink-faint">
                <th className="w-28 px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="w-36 px-4 py-3">Building</th>
                <th className="px-4 py-3">Game or purpose</th>
                <th className="w-24 px-4 py-3">Groups</th>
                <th className="w-36 px-4 py-3">Status</th>
                <th className="w-40 px-4 py-3">Set status</th>
                <th className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-200">
              {stations.map((station) => (
                <tr key={station.id}>
                  <td className="px-4 py-2.5 font-bold">{station.code}</td>
                  <td className="px-4 py-2.5 font-semibold">{station.name}</td>
                  <td className="px-4 py-2.5">{station.area}</td>
                  <td className="px-4 py-2.5 text-ink-soft">
                    {station.purpose || "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold">{counts[station.id] ?? 0}</span>
                    <span className="text-ink-faint">
                      {" / "}
                      {station.max_groups ?? "not set"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <StationStatusChip status={station.status} />
                    {station.status_override && (
                      <span className="ml-1 text-xs text-ink-faint">manual</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      className="input min-h-[36px] text-sm"
                      aria-label={`${station.code} status`}
                      value={station.status}
                      onChange={(e) =>
                        updateStatus(station.id, e.target.value as StationStatus)
                      }
                    >
                      <option value="available">Available</option>
                      <option value="in_progress">In progress</option>
                      <option value="closed">Closed</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => clearStation(station)}
                        className="text-xs font-semibold text-ink-soft"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(station)}
                        className="text-ink-soft"
                        aria-label={`Edit ${station.code}`}
                      >
                        <Pencil size={16} strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteStation(station)}
                        className="text-red-500"
                        aria-label={`Delete ${station.code}`}
                      >
                        <Trash2 size={16} strokeWidth={1.75} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {stations.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-faint">
                    No stations yet. Add one and choose its building.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Games and purposes</h2>
        <Card className="space-y-3">
          <form onSubmit={addPurpose} className="flex flex-col gap-2 sm:flex-row">
            <input
              className="input text-sm"
              placeholder="New game or purpose"
              aria-label="New game or purpose"
              value={newPurpose}
              onChange={(e) => setNewPurpose(e.target.value)}
            />
            <button type="submit" className="btn-secondary min-h-[44px] px-4 text-sm">
              Add game
            </button>
          </form>
          {purposes.length === 0 ? (
            <p className="text-sm text-ink-faint">
              No games yet. Add one here, or type a new one while creating a station.
            </p>
          ) : (
            <ul className="divide-y divide-paper-200">
              {purposes.map((purpose) => {
                const count = stations.filter(
                  (station) => station.purpose === purpose.name
                ).length;
                return (
                  <li
                    key={`${purpose.id}-${purpose.name}`}
                    className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center"
                  >
                    <input
                      className="input min-h-[36px] flex-1 text-sm"
                      aria-label={`Rename ${purpose.name}`}
                      defaultValue={purpose.name}
                      onBlur={(e) => renamePurpose(purpose, e.target.value)}
                    />
                    <span className="text-xs text-ink-faint sm:w-28">
                      {count} {count === 1 ? "station" : "stations"}
                    </span>
                    <button
                      type="button"
                      className="text-sm text-red-500"
                      onClick={() => deletePurpose(purpose)}
                    >
                      Delete
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Groups ({groups.length})</h2>
          <button
            type="button"
            className="btn-secondary min-h-[36px] px-4 text-sm"
            onClick={() => setGroupOpen(true)}
          >
            + Add group
          </button>
        </div>
        <Card className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {groups.map((group) => (
            <div
              key={group.id}
              className="flex justify-between rounded-lg bg-paper-100 px-3 py-2 text-sm"
            >
              <span>{group.name}</span>
              <span className="font-bold tabular-nums">
                {group.token_balance} tokens
              </span>
            </div>
          ))}
        </Card>
      </section>

      <Dialog open={stationOpen} onOpenChange={setStationOpen}>
        <DialogContent title={draft.id ? "Edit station" : "Add station"}>
          <form onSubmit={saveStation} className="space-y-3">
            <p className="text-sm text-ink-faint">
              Code{" "}
              <span className="font-bold text-ink">
                {draft.id
                  ? draft.code
                  : nextStationCode(
                      draft.area,
                      stations.map((station) => station.code)
                    )}
              </span>
            </p>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Name</span>
              <input
                className="input text-sm"
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Building</span>
              <select
                className="input text-sm"
                value={draft.area}
                onChange={(e) => setDraft({ ...draft, area: e.target.value })}
              >
                {MAP_BUILDINGS.map((building) => (
                  <option key={building.area} value={building.area}>
                    {building.area}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Game or purpose</span>
              <select
                className="input text-sm"
                value={draft.purpose}
                onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
              >
                <option value="">None yet</option>
                {purposes.map((purpose) => (
                  <option key={purpose.id} value={purpose.name}>
                    {purpose.name}
                  </option>
                ))}
                {draft.purpose &&
                  draft.purpose !== "__new" &&
                  !purposes.some((purpose) => purpose.name === draft.purpose) && (
                    <option value={draft.purpose}>{draft.purpose}</option>
                  )}
                <option value="__new">Add a new game…</option>
              </select>
            </label>
            {draft.purpose === "__new" && (
              <input
                className="input text-sm"
                placeholder="Name of the new game"
                required
                value={draft.newPurpose}
                onChange={(e) => setDraft({ ...draft, newPurpose: e.target.value })}
              />
            )}
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Status</span>
              <select
                className="input text-sm"
                value={draft.status}
                onChange={(e) =>
                  setDraft({ ...draft, status: e.target.value as StationStatus })
                }
              >
                <option value="available">Available</option>
                <option value="in_progress">In progress</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Groups at once</span>
              <input
                type="number"
                min="1"
                required
                className="input text-sm"
                placeholder="How many groups fit"
                value={draft.max_groups}
                onChange={(e) => setDraft({ ...draft, max_groups: e.target.value })}
              />
              <span className="mt-1 block text-xs text-ink-faint">
                When this many groups are checked in, the station shows In progress.
              </span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="block text-sm">
                <span className="mb-1 block font-semibold">Latitude</span>
                <input
                  type="number"
                  step="any"
                  className="input text-sm"
                  value={draft.lat}
                  onChange={(e) => setDraft({ ...draft, lat: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold">Longitude</span>
                <input
                  type="number"
                  step="any"
                  className="input text-sm"
                  value={draft.lng}
                  onChange={(e) => setDraft({ ...draft, lng: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold">Radius (m)</span>
                <input
                  type="number"
                  min="1"
                  className="input text-sm"
                  placeholder="100"
                  value={draft.radius_m}
                  onChange={(e) => setDraft({ ...draft, radius_m: e.target.value })}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="mb-1 block font-semibold">Day 2 risk</span>
                <select
                  className="input text-sm"
                  value={draft.risk_tier}
                  onChange={(e) =>
                    setDraft({ ...draft, risk_tier: e.target.value as RiskTier })
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold">Entry cost</span>
                <input
                  type="number"
                  min="0"
                  className="input text-sm"
                  value={draft.entry_cost}
                  onChange={(e) =>
                    setDraft({ ...draft, entry_cost: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <button type="submit" className="btn-primary w-full">
              {draft.id ? "Save station" : "Add station"}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent title="Add group">
          <form onSubmit={addGroup} className="space-y-2">
            <input
              className="input text-sm"
              placeholder="New group name"
              required
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
            />
            <button type="submit" className="btn-primary w-full">
              Add group
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
