"use client";

import { useEffect, useMemo, useState } from "react";

import { ErrorBanner } from "@/components/ui";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Station, StationPurpose, StationStatus } from "@/lib/types";
import { friendlyError } from "@/lib/utils";

/** Pop-up for an admin to edit one station. */
export function StationEditDialog({
  station,
  onClose,
  onSaved,
}: {
  station: Station | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [purposes, setPurposes] = useState<StationPurpose[]>([]);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [status, setStatus] = useState<StationStatus>("available");
  const [maxGroups, setMaxGroups] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!station) return;
    setName(station.name);
    setPurpose(station.purpose ?? "");
    setStatus(station.status);
    setMaxGroups(station.max_groups?.toString() ?? "");
    setLat(station.lat?.toString() ?? "");
    setLng(station.lng?.toString() ?? "");
    setRadius(station.radius_m?.toString() ?? "");
    setError(null);
    supabase
      .from("station_purposes")
      .select("id, name")
      .order("name")
      .then(({ data }) => setPurposes((data as StationPurpose[]) ?? []));
  }, [station, supabase]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!station || saving) return;
    setSaving(true);
    setError(null);

    const game = purpose.trim();
    if (game) {
      const { error: purposeError } = await supabase
        .from("station_purposes")
        .upsert({ name: game }, { onConflict: "name", ignoreDuplicates: true });
      if (purposeError) {
        setError(purposeError.message);
        setSaving(false);
        return;
      }
    }

    const { error: updateError } = await supabase
      .from("stations")
      .update({
        name: name.trim(),
        purpose: game,
        max_groups: Number(maxGroups),
        lat: lat ? Number(lat) : null,
        lng: lng ? Number(lng) : null,
        radius_m: radius ? Number(radius) : null,
      })
      .eq("id", station.id);
    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    if (status !== station.status) {
      const { error: statusError } = await supabase.rpc("fn_set_station_status", {
        p_station_id: station.id,
        p_status: status,
      });
      if (statusError) {
        setError(friendlyError(statusError));
        setSaving(false);
        onSaved();
        return;
      }
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <Dialog open={station !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={station ? `Edit ${station.code}` : "Edit station"}>
        <form onSubmit={save} className="space-y-3">
          <ErrorBanner message={error} />
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
              list="station-edit-games"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Optional"
            />
            <datalist id="station-edit-games">
              {purposes.map((item) => (
                <option key={item.id} value={item.name} />
              ))}
            </datalist>
          </label>
          <div className="grid grid-cols-2 gap-2">
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
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Latitude</span>
              <input
                type="number"
                step="any"
                className="input text-sm"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Longitude</span>
              <input
                type="number"
                step="any"
                className="input text-sm"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Radius (m)</span>
              <input
                type="number"
                min="1"
                className="input text-sm"
                placeholder="100"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
              />
            </label>
          </div>
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? "Saving…" : "Save station"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
