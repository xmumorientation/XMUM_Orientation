"use client";

import { useEffect, useMemo, useState } from "react";

import { StationEditDialog } from "@/components/StationEditDialog";
import { ErrorBanner, StationStatusChip } from "@/components/ui";
import {
  nextStationCode,
  stationNumberFromCode,
  stationPosition,
} from "@/lib/mapBuildings";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";
import type { Station, StationPurpose, StationStatus } from "@/lib/types";

export function BuildingStationPanel({
  area,
  stations,
  codes,
  onClose,
  onChanged,
}: {
  area: string;
  stations: Station[];
  codes: string[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [purposes, setPurposes] = useState<StationPurpose[]>([]);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [status, setStatus] = useState<StationStatus>("available");
  const [maxGroups, setMaxGroups] = useState("");
  const [editing, setEditing] = useState<Station | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nextCode = nextStationCode(area, codes);

  useEffect(() => {
    let active = true;
    supabase
      .from("station_purposes")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        if (active && data) setPurposes(data as StationPurpose[]);
      });
    return () => {
      active = false;
    };
  }, [supabase, stations]);

  async function rememberPurpose(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const { error: upsertError } = await supabase
      .from("station_purposes")
      .upsert({ name: trimmed }, { onConflict: "name", ignoreDuplicates: true });
    if (upsertError) throw new Error(upsertError.message);
    return trimmed;
  }

  async function addStation(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const game = await rememberPurpose(purpose);
      const spot = stationPosition(area, stations.length) ?? { x: 50, y: 50 };
      const { data: created, error: insertError } = await supabase
        .from("stations")
        .insert({
        code: nextCode,
        station_number: stationNumberFromCode(nextCode),
        name: name.trim(),
        area,
        purpose: game,
        map_x: spot.x,
        map_y: spot.y,
        max_groups: Number(maxGroups),
      })
        .select("id")
        .single();
      if (insertError || !created) {
        setError(insertError?.message ?? "Could not add the station.");
        return;
      }
      const { error: statusError } = await supabase.rpc("fn_set_station_status", {
        p_station_id: created.id,
        p_status: status,
      });
      if (statusError) setError(friendlyError(statusError));
      setName("");
      setPurpose("");
      setStatus("available");
      setMaxGroups("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the station.");
    }
  }

  async function savePurpose(station: Station, value: string) {
    setError(null);
    try {
      const game = await rememberPurpose(value);
      if (game === (station.purpose ?? "")) return;
      const { error: updateError } = await supabase
        .from("stations")
        .update({ purpose: game })
        .eq("id", station.id);
      if (updateError) setError(updateError.message);
      else onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the game.");
    }
  }

  async function saveStatus(station: Station, next: StationStatus) {
    if (next === station.status) return;
    setError(null);
    const { error: updateError } = await supabase.rpc("fn_set_station_status", {
      p_station_id: station.id,
      p_status: next,
    });
    if (updateError) setError(friendlyError(updateError));
    else onChanged();
  }

  async function saveMaxGroups(station: Station, value: string) {
    const next = Number(value);
    if (!Number.isInteger(next) || next < 1 || next === station.max_groups) return;
    setError(null);
    const { error: updateError } = await supabase
      .from("stations")
      .update({ max_groups: next })
      .eq("id", station.id);
    if (updateError) setError(updateError.message);
    else onChanged();
  }

  async function clearStation(station: Station) {
    if (!window.confirm(`Remove all groups from ${station.code}?`)) return;
    setError(null);
    const { error: clearError } = await supabase.rpc("fn_clear_station", {
      p_station_id: station.id,
    });
    if (clearError) setError(friendlyError(clearError));
    else onChanged();
  }

  async function removeStation(station: Station) {
    if (!window.confirm(`Delete ${station.code}?`)) return;
    setError(null);
    const { error: deleteError } = await supabase
      .from("stations")
      .delete()
      .eq("id", station.id);
    if (deleteError) setError(deleteError.message);
    else onChanged();
  }

  return (
    <div className="card mt-3 space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{area}</h2>
          <p className="text-sm text-ink-faint">
            {stations.length === 0
              ? "No stations here yet."
              : `${stations.length} ${stations.length === 1 ? "station" : "stations"}`}
          </p>
        </div>
        <button type="button" className="text-sm text-ink-faint" onClick={onClose}>
          Close
        </button>
      </div>

      <ErrorBanner message={error} />

      {stations.length > 0 && (
        <ul className="divide-y divide-paper-200">
          {stations.map((station) => (
            <li key={station.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 sm:w-40">
                <p className="font-bold">{station.code}</p>
                <p className="truncate text-sm text-ink-soft">{station.name}</p>
              </div>
              <input
                className="input min-h-[36px] flex-1 text-sm"
                aria-label={`${station.code} game`}
                list="station-games"
                defaultValue={station.purpose ?? ""}
                placeholder="Game or purpose"
                onBlur={(e) => savePurpose(station, e.target.value)}
              />
              <input
                type="number"
                min="1"
                className="input min-h-[36px] text-sm sm:w-24"
                aria-label={`${station.code} groups at once`}
                placeholder="Groups"
                defaultValue={station.max_groups ?? ""}
                onBlur={(e) => saveMaxGroups(station, e.target.value)}
              />
              <select
                className="input min-h-[36px] text-sm sm:w-40"
                aria-label={`${station.code} status`}
                value={station.status}
                onChange={(e) => saveStatus(station, e.target.value as StationStatus)}
              >
                <option value="available">Available</option>
                <option value="in_progress">In progress</option>
                <option value="closed">Closed</option>
              </select>
              <StationStatusChip status={station.status} />
              <button
                type="button"
                className="text-sm font-semibold text-ink-base"
                onClick={() => setEditing(station)}
              >
                Edit
              </button>
              <button
                type="button"
                className="text-sm text-ink-soft"
                onClick={() => clearStation(station)}
              >
                Clear
              </button>
              <button
                type="button"
                className="text-sm text-red-500"
                onClick={() => removeStation(station)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addStation} className="grid gap-2 border-t border-paper-200 pt-3 sm:grid-cols-2">
        <p className="text-sm font-semibold sm:col-span-2">
          New station <span className="font-bold">{nextCode}</span>
        </p>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Name</span>
          <input
            className="input text-sm"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Game or purpose</span>
          <input
            className="input text-sm"
            list="station-games"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Optional"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Groups at once</span>
          <input
            type="number"
            min="1"
            required
            className="input text-sm"
            value={maxGroups}
            onChange={(e) => setMaxGroups(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Status</span>
          <select
            className="input text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as StationStatus)}
          >
            <option value="available">Available</option>
            <option value="in_progress">In progress</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <div className="flex items-end">
          <button type="submit" className="btn-primary w-full">
            Add station
          </button>
        </div>
        <datalist id="station-games">
          {purposes.map((item) => (
            <option key={item.id} value={item.name} />
          ))}
        </datalist>
      </form>
      <StationEditDialog
        station={editing}
        onClose={() => setEditing(null)}
        onSaved={onChanged}
      />
    </div>
  );
}
