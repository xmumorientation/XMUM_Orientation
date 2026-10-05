"use client";

import { Trash2 } from "lucide-react";
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
import type { Group, RiskTier, Station, StationStatus } from "@/lib/types";

// FR-11.3: station management (count/IDs still open per D-2 — fully
// editable here without redeploy). Also group creation.
export default function AdminStationsPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [stations, setStations] = useState<Station[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [newStation, setNewStation] = useState({ code: "", name: "", area: "" });
  const [newGroup, setNewGroup] = useState("");
  const [stationOpen, setStationOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
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
      setStationOpen(false);
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
      setGroupOpen(false);
      flash("Group added.");
      load();
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Stations & groups"
        action={
          <button type="button" className="btn-primary px-5" onClick={() => setStationOpen(true)}>
            + Add station
          </button>
        }
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <section>
        <h2 className="mb-2 font-semibold">Stations ({stations.length})</h2>
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-paper-200 text-xs font-bold uppercase tracking-wide text-ink-faint">
                <th className="w-24 px-4 py-3">Code</th>
                <th className="px-4 py-3">Name &amp; area</th>
                <th className="w-32 px-4 py-3">Status</th>
                <th className="w-36 px-4 py-3">Set status</th>
                <th className="w-32 px-4 py-3">Day 2 risk</th>
                <th className="w-28 px-4 py-3">Entry cost</th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-200">
              {stations.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2.5 font-bold">{s.code}</td>
                  <td className="max-w-0 px-4 py-2.5">
                    <p className="truncate font-semibold">{s.name}</p>
                    <p className="truncate text-xs text-ink-faint">
                      {s.area} · map ({Number(s.map_x)}, {Number(s.map_y)})
                    </p>
                  </td>
                  <td className="px-4 py-2.5">
                    <StationStatusChip status={s.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      className="input min-h-[36px] text-sm"
                      aria-label={`${s.code} status`}
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
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      className="input min-h-[36px] text-sm"
                      aria-label={`${s.code} Day 2 risk tier`}
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
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      min="0"
                      aria-label={`${s.code} Day 2 entry cost (tokens)`}
                      className="input min-h-[36px] w-20 px-2 text-sm"
                      defaultValue={s.entry_cost}
                      onBlur={(e) =>
                        updateStation(s.id, { entry_cost: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => deleteStation(s.id)}
                      className="text-red-500"
                      aria-label={`Delete ${s.code}`}
                    >
                      <Trash2 size={16} strokeWidth={1.75} />
                    </button>
                  </td>
                </tr>
              ))}
              {stations.length === 0 && (
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
          {groups.map((g) => (
            <div
              key={g.id}
              className="flex justify-between rounded-lg bg-paper-100 px-3 py-2 text-sm"
            >
              <span>{g.name}</span>
              <span className="font-bold tabular-nums">
                {g.token_balance} tokens
              </span>
            </div>
          ))}
        </Card>
      </section>

      <Dialog open={stationOpen} onOpenChange={setStationOpen}>
        <DialogContent title="Add station">
          <form onSubmit={addStation} className="space-y-2">
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
              className="input text-sm"
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
            <button type="submit" className="btn-primary w-full">
              Add station
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
