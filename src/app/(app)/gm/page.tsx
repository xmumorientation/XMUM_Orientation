"use client";

import { useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { useConfig } from "@/components/useConfig";
import { useOfflineQueue } from "@/components/useOfflineQueue";
import {
  Card,
  ErrorBanner,
  PageTitle,
  StationStatusChip,
  SuccessBanner,
} from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  PROJECTOR_LABELS,
  PROJECTOR_LOCATIONS,
  RISK_TIER_META,
  type Day2Result,
  type ProjectorLocation,
  type Station,
  type StationStatus,
} from "@/lib/types";
import { cn, friendlyError, idemKey } from "@/lib/utils";

type Tab = "day1" | "day2" | "box" | "station";

// GM control panel v2 (HOGM redesign):
//  Day 1 — win/lose rewards (+2/+1)
//  Day 2 — pick group + result (+ tier locations); the system deducts the
//          station's entry fee and auto-grants a random non-duplicate piece
//  Box   — sell one of the limited GM blind boxes
// All submissions carry idempotency keys and queue offline (NFR-6).
export default function GmPanelPage() {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { config } = useConfig();
  const { queue, submit } = useOfflineQueue();

  const [tab, setTab] = useState<Tab>("day1");
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [station, setStation] = useState<Station | null>(null);
  const [success, setSuccess] = useState(true);
  const [locations, setLocations] = useState<ProjectorLocation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [boxesSold, setBoxesSold] = useState<number>(0);

  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: gs }, { count }] = await Promise.all([
        supabase.rpc("fn_list_groups"),
        supabase
          .from("blind_box_sales")
          .select("*", { count: "exact", head: true }),
      ]);
      if (!active) return;
      setGroups(gs ?? []);
      setBoxesSold(count ?? 0);
      if (profile.station_id) {
        const { data: st } = await supabase
          .from("stations")
          .select("*")
          .eq("id", profile.station_id)
          .single();
        if (active) setStation((st as Station) ?? null);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [supabase, profile.station_id]);

  function flash(msg: string) {
    setNotice(msg);
    setError(null);
    setTimeout(() => setNotice(null), 4000);
  }

  async function day1Reward(delta: number, reason: string) {
    if (!groupId) return setError("先选组别 Select a group first.");
    setBusy(true);
    setError(null);
    const res = await submit(
      "fn_adjust_tokens",
      {
        p_group_id: groupId,
        p_delta: delta,
        p_reason: reason,
        p_idempotency_key: idemKey(),
      },
      `${delta > 0 ? "+" : ""}${delta} → group ${groupId}`
    );
    setBusy(false);
    if (res.status === "confirmed") {
      const bal = (res.data as { balance?: number })?.balance;
      flash(`✓ ${reason}: ${delta > 0 ? "+" : ""}${delta}${bal !== undefined ? ` · balance ${bal}` : ""}`);
    } else if (res.status === "queued") {
      flash("📶 Offline — queued, will send automatically.");
    } else {
      setError(friendlyError({ message: res.error }));
    }
  }

  async function undo() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("fn_undo_last_transaction");
    setBusy(false);
    if (error) setError(friendlyError(error));
    else flash(`Undone. Balance: ${(data as { balance?: number })?.balance ?? "updated"}`);
  }

  const tier = station?.risk_tier ?? "low";
  const needPicks = RISK_TIER_META[tier].pick;

  function toggleLocation(loc: ProjectorLocation) {
    setLocations((cur) => {
      if (cur.includes(loc)) return cur.filter((l) => l !== loc);
      if (cur.length >= needPicks) {
        // replace the oldest pick so the flow stays 2-tap fast
        return [...cur.slice(1 - needPicks || 1), loc].slice(-needPicks);
      }
      return [...cur, loc];
    });
  }

  async function submitDay2() {
    if (!groupId) return setError("先选组别 Select a group first.");
    if (needPicks > 0 && locations.length !== needPicks) {
      return setError(
        needPicks === 2 ? "Pick exactly 2 locations." : "Pick exactly 1 location."
      );
    }
    setBusy(true);
    setError(null);
    const res = await submit(
      "fn_day2_challenge",
      {
        p_group_id: groupId,
        p_success: success,
        p_locations: needPicks > 0 ? locations : null,
        p_idempotency_key: idemKey(),
      },
      `day2 ${success ? "win" : "lose"} → group ${groupId}`
    );
    setBusy(false);
    if (res.status === "confirmed") {
      const d = res.data as Day2Result;
      if (d.duplicate) return flash("Duplicate ignored (already recorded).");
      flash(
        d.success && d.piece_name
          ? `✓ −${d.cost} tokens · granted ${d.piece_name} 🧩 · balance ${d.balance}`
          : `✓ −${d.cost} tokens (challenge lost) · balance ${d.balance}`
      );
      setLocations([]);
    } else if (res.status === "queued") {
      flash("📶 Offline — queued, will send automatically.");
    } else {
      setError(friendlyError({ message: res.error }));
    }
  }

  async function sellBox() {
    if (!groupId) return setError("先选组别 Select a group first.");
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("fn_sell_blind_box", {
      p_group_id: groupId,
      p_idempotency_key: idemKey(),
    });
    setBusy(false);
    if (error) setError(friendlyError(error));
    else {
      const d = data as { tokens: number; price: number; balance: number };
      flash(`📦 Box opened: paid ${d.price}, won ${d.tokens} tokens · balance ${d.balance}`);
      setBoxesSold((n) => n + 1);
    }
  }

  async function setStatus(status: StationStatus) {
    if (!station) return;
    setBusy(true);
    const { error } = await supabase.rpc("fn_set_station_status", {
      p_station_id: station.id,
      p_status: status,
    });
    setBusy(false);
    if (error) setError(friendlyError(error));
    else setStation({ ...station, status });
  }

  const boxPrice = Number(config["gm_blindbox_price"] ?? 2);
  const boxStock = Number(config["gm_blindbox_stock"] ?? 8);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Station panel"
        subtitle={
          station
            ? `${station.name} · ${RISK_TIER_META[tier].label} (entry ${station.entry_cost})`
            : undefined
        }
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      {queue.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⏳ {queue.length} submission{queue.length > 1 ? "s" : ""} queued
          offline — will send when connection returns.
        </div>
      )}

      <Card>
        <label className="label" htmlFor="group">
          Group
        </label>
        <select
          id="group"
          className="input"
          value={groupId ?? ""}
          onChange={(e) => setGroupId(Number(e.target.value) || null)}
        >
          <option value="">Select group…</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Card>

      <div className="grid grid-cols-4 gap-1 rounded-xl bg-base-200 p-1">
        {(
          [
            ["day1", "Day 1"],
            ["day2", "Day 2"],
            ["box", "Box"],
            ["station", "Status"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "min-h-[40px] rounded-lg text-sm font-semibold",
              tab === t ? "bg-white shadow-card" : "text-ink-faint"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "day1" && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Day 1 rewards</h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={busy}
              onClick={() => day1Reward(2, "Station win")}
              className="btn bg-green-600 text-lg text-white"
            >
              🏆 Win +2
            </button>
            <button
              disabled={busy}
              onClick={() => day1Reward(1, "Station participation")}
              className="btn bg-green-500 text-lg text-white"
            >
              Lose +1
            </button>
          </div>
          <button disabled={busy} onClick={undo} className="btn-secondary w-full">
            ↩︎ Undo my last transaction (2 min window)
          </button>
        </Card>
      )}

      {tab === "day2" && (
        <Card className="space-y-3">
          <div>
            <h2 className="font-semibold">Day 2 challenge result</h2>
            <p className="text-sm text-ink-faint">
              {RISK_TIER_META[tier].label}: {RISK_TIER_META[tier].desc}. Entry
              fee −{station?.entry_cost ?? "?"} is charged win or lose; a win
              grants a random piece the group doesn&apos;t own yet.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSuccess(true)}
              className={cn(
                "btn text-base",
                success
                  ? "bg-green-600 text-white"
                  : "border border-base-300 bg-white text-ink-soft"
              )}
            >
              ✓ Success
            </button>
            <button
              onClick={() => setSuccess(false)}
              className={cn(
                "btn text-base",
                !success
                  ? "bg-red-600 text-white"
                  : "border border-base-300 bg-white text-ink-soft"
              )}
            >
              ✗ Failed
            </button>
          </div>

          {needPicks > 0 && (
            <div>
              <label className="label">
                {needPicks === 2 ? "Pick 2 locations" : "Pick the location"}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {PROJECTOR_LOCATIONS.map((loc) => (
                  <button
                    key={loc}
                    onClick={() => toggleLocation(loc)}
                    className={cn(
                      "btn text-sm",
                      locations.includes(loc)
                        ? "bg-star-violet text-white"
                        : "border border-base-300 bg-white"
                    )}
                  >
                    {PROJECTOR_LABELS[loc]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            disabled={busy || !station}
            onClick={submitDay2}
            className="btn-primary w-full"
          >
            Submit (−{station?.entry_cost ?? "?"} tokens
            {success ? " + 🧩 piece" : ""})
          </button>
          {!station && (
            <p className="text-sm text-red-600">
              No station assigned to your account — ask Admin.
            </p>
          )}
        </Card>
      )}

      {tab === "box" && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Sell a blind box</h2>
          <p className="text-sm text-ink-faint">
            Price −{boxPrice} tokens, contents are random tokens. Limited
            stock: {Math.max(0, boxStock - boxesSold)} of {boxStock} left
            (shared across all GMs).
          </p>
          <button
            disabled={busy || boxesSold >= boxStock}
            onClick={sellBox}
            className="btn-primary w-full"
          >
            📦 Sell & open (−{boxPrice} tokens)
          </button>
        </Card>
      )}

      {tab === "station" && (
        <Card className="space-y-3">
          {station ? (
            <>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{station.name}</span>
                <StationStatusChip status={station.status} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  disabled={busy}
                  onClick={() => setStatus("available")}
                  className="btn bg-green-600 text-sm text-white"
                >
                  🟢 Available
                </button>
                <button
                  disabled={busy}
                  onClick={() => setStatus("in_progress")}
                  className="btn bg-red-600 text-sm text-white"
                >
                  🔴 Busy
                </button>
                <button
                  disabled={busy}
                  onClick={() => setStatus("closed")}
                  className="btn bg-gray-500 text-sm text-white"
                >
                  ⚪ Closed
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-faint">
              No station assigned to your account — ask Admin to set your
              station.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
