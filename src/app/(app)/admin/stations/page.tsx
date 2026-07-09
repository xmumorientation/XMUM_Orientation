"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Card,
  ErrorBanner,
  PageTitle,
  StationStatusChip,
  SuccessBanner,
} from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Group, RiskTier, Station, StationStatus } from "@/lib/types";

// FR-11.3: station management (count/IDs still open per D-2 — fully
// editable here without redeploy). Also group creation.
export default function AdminStationsPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [stations, setStations] = useState<Station[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [newStation, setNewStation] = useState({ code: "", name: "", area: "" });
  const [newGroup, setNewGroup] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: sts }, { data: gs }] = await Promise.all([
      supabase.from("stations").select("*").order("id"),
      supabase.from("groups").select("*").order("id"),
    ]);
    setStations((sts as Station[]) ?? []);
    setGroups((gs as Group[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2000);
  }

  async function addStation(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.from("stations").insert({
      code: newStation.code,
      name: newStation.name,
      area: newStation.area || "TBD",
    });
    if (error) setError(error.message);
    else {
      setNewStation({ code: "", name: "", area: "" });
      flash("Station added.");
      load();
    }
  }

  async function updateStation(id: number, patch: Partial<Station>) {
    const { error } = await supabase.from("stations").update(patch).eq("id", id);
    if (error) setError(error.message);
    else {
      setStations((sts) =>
        sts.map((s) => (s.id === id ? { ...s, ...patch } : s))
      );
    }
  }

  async function deleteStation(id: number) {
    if (!window.confirm("Delete this station?")) return;
    const { error } = await supabase.from("stations").delete().eq("id", id);
    if (error) setError(error.message);
    else load();
  }

  async function addGroup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.from("groups").insert({ name: newGroup });
    if (error) setError(error.message);
    else {
      setNewGroup("");
      flash("Group added.");
      load();
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Stations & groups" />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <Card className="space-y-2">
        <h2 className="font-semibold">Stations ({stations.length})</h2>
        <div className="max-h-[400px] space-y-2 overflow-y-auto">
          {stations.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-xl border border-base-200 p-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {s.code} · {s.name}
                </p>
                <p className="text-xs text-ink-faint">
                  {s.area} · map ({Number(s.map_x)}, {Number(s.map_y)})
                </p>
              </div>
              <StationStatusChip status={s.status} />
              <select
                className="input min-h-[36px] w-[100px] text-xs"
                value={s.status}
                onChange={(e) =>
                  updateStation(s.id, {
                    status: e.target.value as StationStatus,
                  })
                }
              >
                <option value="available">Available</option>
                <option value="in_progress">In progress</option>
                <option value="closed">Closed</option>
              </select>
              <select
                className="input min-h-[36px] w-[92px] text-xs"
                title="Day 2 risk tier"
                value={s.risk_tier}
                onChange={(e) =>
                  updateStation(s.id, {
                    risk_tier: e.target.value as RiskTier,
                  })
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <input
                type="number"
                min="0"
                title="Day 2 entry cost (tokens)"
                className="input min-h-[36px] w-[64px] px-2 text-xs"
                defaultValue={s.entry_cost}
                onBlur={(e) =>
                  updateStation(s.id, { entry_cost: Number(e.target.value) })
                }
              />
              <button
                onClick={() => deleteStation(s.id)}
                className="text-sm text-red-500"
                aria-label={`Delete ${s.code}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <form onSubmit={addStation} className="grid grid-cols-4 gap-2">
          <input
            className="input text-sm"
            placeholder="Code"
            required
            value={newStation.code}
            onChange={(e) =>
              setNewStation({ ...newStation, code: e.target.value })
            }
          />
          <input
            className="input col-span-2 text-sm"
            placeholder="Name"
            required
            value={newStation.name}
            onChange={(e) =>
              setNewStation({ ...newStation, name: e.target.value })
            }
          />
          <input
            className="input text-sm"
            placeholder="Area"
            value={newStation.area}
            onChange={(e) =>
              setNewStation({ ...newStation, area: e.target.value })
            }
          />
          <button type="submit" className="btn-secondary col-span-4">
            + Add station
          </button>
        </form>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">Groups ({groups.length})</h2>
        <div className="grid grid-cols-2 gap-2">
          {groups.map((g) => (
            <div
              key={g.id}
              className="flex justify-between rounded-lg bg-base-100 px-3 py-2 text-sm"
            >
              <span>{g.name}</span>
              <span className="font-bold tabular-nums">
                {g.token_balance} tokens
              </span>
            </div>
          ))}
        </div>
        <form onSubmit={addGroup} className="flex gap-2">
          <input
            className="input flex-1 text-sm"
            placeholder="New group name"
            required
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
          />
          <button type="submit" className="btn-secondary">
            + Add
          </button>
        </form>
      </Card>
    </div>
  );
}
