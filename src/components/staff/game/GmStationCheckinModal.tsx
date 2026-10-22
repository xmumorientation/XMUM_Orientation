"use client";

import { useEffect, useMemo, useState } from "react";
import { LogOut, Plus, Users, X } from "lucide-react";

import { useProfile } from "@/components/ProfileProvider";
import {
  Dialog,
  DialogClose,
  DialogContent,
} from "@/components/ui/Dialog";
import { ErrorBanner, StationStatusChip, SuccessBanner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Station } from "@/lib/types";
import { friendlyError, timeAgo } from "@/lib/utils";

interface Occupant {
  group_id: number;
  group_name: string;
  checked_in_at: string;
}

interface GroupOption {
  id: number;
  name: string;
}

export function GmStationCheckinModal({
  station,
  onClose,
  onOccupancyChanged,
}: {
  station: Station | null;
  onClose: () => void;
  onOccupancyChanged?: () => void;
}) {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [occupants, setOccupants] = useState<Occupant[]>([]);
  const [allGroups, setAllGroups] = useState<GroupOption[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isLead = profile.role === "admin" || profile.role === "hogm";
  const canCheckin = isLead;

  const stationId = station?.id;

  // Best-effort position for geofence warning
  function getPosition(): Promise<GeolocationPosition | null> {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        () => resolve(null),
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 6000 }
      );
    });
  }

  // Load occupants and group directory
  useEffect(() => {
    if (!stationId) return;
    let active = true;

    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const [occRes, groupsRes] = await Promise.all([
          supabase.rpc("fn_station_occupants", { p_station_id: stationId }),
          supabase.rpc("fn_list_groups"),
        ]);

        if (!active) return;
        if (occRes.data) {
          setOccupants((occRes.data as Occupant[]) ?? []);
        }
        if (groupsRes.data) {
          setAllGroups((groupsRes.data as GroupOption[]) ?? []);
        }
      } catch (err) {
        if (active) setError(friendlyError(err));
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    // Realtime occupancy updates
    const channel = supabase
      .channel(`gm-occ-${stationId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "station_occupancy",
          filter: `station_id=eq.${stationId}`,
        },
        () => {
          loadData();
          onOccupancyChanged?.();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, stationId, onOccupancyChanged]);

  async function handleCheckin(e: React.FormEvent) {
    e.preventDefault();
    if (!stationId || !selectedGroupId || busy) return;

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const pos = await getPosition();
      const { data, error: rpcErr } = await supabase.rpc("fn_manual_checkin", {
        p_station_id: stationId,
        p_group_id: selectedGroupId,
        p_lat: pos?.coords.latitude ?? null,
        p_lng: pos?.coords.longitude ?? null,
        p_accuracy: pos?.coords.accuracy ?? null,
      });

      if (rpcErr) {
        setError(friendlyError(rpcErr));
      } else {
        const targetGroup = allGroups.find((g) => g.id === selectedGroupId);
        const groupName = targetGroup ? targetGroup.name : `Group ${selectedGroupId}`;
        const farAway = (data as { far_away?: boolean } | null)?.far_away;

        setNotice(
          farAway
            ? `Checked in ${groupName}, but GPS indicates you might be far from this station.`
            : `Checked in ${groupName} successfully.`
        );
        setSelectedGroupId(null);

        // Reload occupants
        const { data: updated } = await supabase.rpc("fn_station_occupants", {
          p_station_id: stationId,
        });
        if (updated) setOccupants((updated as Occupant[]) ?? []);
        onOccupancyChanged?.();
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckout(groupId: number, groupName: string) {
    if (!stationId || busy) return;

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const { error: rpcErr } = await supabase.rpc("fn_uncheckin", {
        p_group_id: groupId,
      });

      if (rpcErr) {
        setError(friendlyError(rpcErr));
      } else {
        setNotice(`${groupName} checked out.`);
        setOccupants((cur) => cur.filter((o) => o.group_id !== groupId));
        onOccupancyChanged?.();
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!station) return null;

  const isFull = station.max_groups != null && occupants.length >= station.max_groups;
  const isClosed = station.status === "closed";
  const checkedInGroupIds = new Set(occupants.map((o) => o.group_id));
  const availableGroups = allGroups.filter((g) => !checkedInGroupIds.has(g.id));

  return (
    <Dialog open={station !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        layout="center"
        title={`Station ${station.code}`}
        showClose={false}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
      >
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-paper-200 pb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-ink-base">{station.code}</span>
                <StationStatusChip status={station.status} />
              </div>
              <h2 className="truncate text-base font-semibold text-ink-base">{station.name}</h2>
              <p className="text-xs text-ink-faint">
                {station.area}
                {station.purpose ? ` · ${station.purpose}` : ""}
              </p>
            </div>
            <DialogClose asChild>
              <button
                type="button"
                aria-label="Close"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-faint transition hover:bg-paper-100 hover:text-ink-base"
              >
                <X size={18} />
              </button>
            </DialogClose>
          </div>

          <ErrorBanner message={error} />
          <SuccessBanner message={notice} />

          {/* Occupancy Header / Capacity */}
          <div className="flex items-center justify-between rounded-xl bg-paper-100 px-3.5 py-2.5 text-sm">
            <span className="flex items-center gap-1.5 font-medium text-ink-soft">
              <Users size={16} aria-hidden />
              Station Occupancy
            </span>
            <span className="font-semibold text-ink-base">
              {occupants.length}
              {station.max_groups != null ? ` / ${station.max_groups}` : ""} groups
            </span>
          </div>

          {/* Current Occupants List */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-faint">
              Currently at station
            </h3>
            {loading ? (
              <p className="py-2 text-xs text-ink-faint">Loading occupants…</p>
            ) : occupants.length === 0 ? (
              <p className="rounded-xl border border-dashed border-paper-200 py-3 text-center text-xs text-ink-faint">
                No groups checked in at this station right now.
              </p>
            ) : (
              <ul className="divide-y divide-paper-200 rounded-xl border border-paper-200 bg-white">
                {occupants.map((occ) => (
                  <li
                    key={occ.group_id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-base">{occ.group_name}</p>
                      <p className="text-xs text-ink-faint">
                        Checked in {timeAgo(occ.checked_in_at, Date.now())}
                      </p>
                    </div>
                    {canCheckin && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleCheckout(occ.group_id, occ.group_name)}
                        className="inline-flex items-center gap-1 rounded-lg border border-paper-300 px-2.5 py-1 text-xs font-semibold text-ink-soft hover:bg-paper-100 hover:text-red-600 disabled:opacity-50"
                      >
                        <LogOut size={13} aria-hidden />
                        Check out
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Check-in Section (Only for Admin/Lead) */}
          {canCheckin ? (
            <div className="space-y-2 border-t border-paper-200 pt-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-faint">
                Check in arriving group
              </h3>

              {isClosed ? (
                <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
                  This station is currently <strong>Closed</strong>. Set it to Available to check in groups.
                </div>
              ) : isFull ? (
                <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
                  This station is <strong>full</strong> ({occupants.length} / {station.max_groups} groups). Check out a group before admitting another.
                </div>
              ) : (
                <form onSubmit={handleCheckin} className="space-y-3">
                  <div>
                    <label htmlFor="checkin-group-select" className="mb-1 block text-xs font-medium text-ink-soft">
                      Select group
                    </label>
                    <select
                      id="checkin-group-select"
                      value={selectedGroupId ?? ""}
                      onChange={(e) => setSelectedGroupId(Number(e.target.value) || null)}
                      className="input w-full text-sm font-medium"
                      disabled={busy}
                    >
                      <option value="">Choose group…</option>
                      {availableGroups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={!selectedGroupId || busy}
                    className="btn-primary flex w-full items-center justify-center gap-1.5"
                  >
                    <Plus size={16} aria-hidden />
                    {busy ? "Checking in…" : "Confirm Check-in"}
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-paper-100 p-3 text-xs text-ink-faint">
              Only Game Leads can check in groups here.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
