"use client";

import { useEffect, useMemo, useState } from "react";

import { GachaReveal } from "@/components/GachaReveal";
import { useProfile } from "@/components/ProfileProvider";
import { useOfflineQueue } from "@/components/useOfflineQueue";
import {
  Card,
  ErrorBanner,
  PageTitle,
  StationStatusChip,
  SuccessBanner,
} from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type {
  GachaResult,
  Item,
  Station,
  StationStatus,
} from "@/lib/types";
import { cn, friendlyError, idemKey } from "@/lib/utils";

type Tab = "tokens" | "items" | "gacha" | "station";

// GM control panel (FR-5.2): select group → tap amount. Two-tap max.
// All mutations run through the offline retry queue (NFR-6) with
// idempotency keys (FR-5.7).
export default function GmPanelPage() {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { queue, submit } = useOfflineQueue();

  const [tab, setTab] = useState<Tab>("tokens");
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [station, setStation] = useState<Station | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gacha, setGacha] = useState<GachaResult | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: gs }, { data: its }] = await Promise.all([
        supabase.rpc("fn_list_groups"),
        supabase.from("items").select("*").order("id"),
      ]);
      if (!active) return;
      setGroups(gs ?? []);
      setItems((its as Item[]) ?? []);
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

  function flash(ok: string | null, err: string | null) {
    setNotice(ok);
    setError(err);
    setTimeout(() => {
      setNotice(null);
    }, 3000);
  }

  async function adjustTokens(delta: number, reason: string) {
    if (!groupId) {
      setError("Select a group first.");
      return;
    }
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
      `${delta > 0 ? "+" : ""}${delta} tokens → group ${groupId}`
    );
    setBusy(false);
    if (res.status === "confirmed") {
      const bal = (res.data as { balance?: number })?.balance;
      flash(
        `Done: ${delta > 0 ? "+" : ""}${delta} tokens${bal !== undefined ? ` · new balance ${bal}` : ""}`,
        null
      );
    } else if (res.status === "queued") {
      flash("📶 Offline — queued, will send automatically.", null);
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
    else
      flash(
        `Undone. Balance is now ${(data as { balance?: number })?.balance ?? "updated"}.`,
        null
      );
  }

  async function grantItem(item: Item) {
    if (!groupId) {
      setError("Select a group first.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await submit(
      "fn_grant_item",
      {
        p_group_id: groupId,
        p_item_id: item.id,
        p_idempotency_key: idemKey(),
      },
      `${item.name} → group ${groupId}`
    );
    setBusy(false);
    if (res.status === "confirmed") flash(`Granted: ${item.name}`, null);
    else if (res.status === "queued")
      flash("📶 Offline — queued, will send automatically.", null);
    else setError(friendlyError({ message: res.error }));
  }

  async function drawGacha(poolKey: string) {
    if (!groupId) {
      setError("Select a group first.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("fn_gacha_draw", {
      p_group_id: groupId,
      p_pool_key: poolKey,
      p_idempotency_key: idemKey(),
    });
    setBusy(false);
    if (error) setError(friendlyError(error));
    else setGacha(data as GachaResult);
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

  const puzzleItems = items.filter((i) => i.type === "puzzle");
  const cardItems = items.filter((i) => i.type === "facility_card");

  return (
    <div className="space-y-4">
      <PageTitle
        title="Station panel"
        subtitle={station ? `${station.name} (${station.area})` : undefined}
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
        {(["tokens", "items", "gacha", "station"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "min-h-[40px] rounded-lg text-sm font-semibold capitalize",
              tab === t ? "bg-white shadow-card" : "text-ink-faint"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "tokens" && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Day 1 rewards</h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={busy}
              onClick={() => adjustTokens(2, "Station win")}
              className="btn bg-green-600 text-lg text-white"
            >
              +2 Win
            </button>
            <button
              disabled={busy}
              onClick={() => adjustTokens(1, "Station participation")}
              className="btn bg-green-500 text-lg text-white"
            >
              +1 Lose
            </button>
          </div>
          <h2 className="pt-2 font-semibold">Day 2 entry fees</h2>
          <div className="grid grid-cols-3 gap-2">
            {[-1, -2, -3].map((d) => (
              <button
                key={d}
                disabled={busy}
                onClick={() => adjustTokens(d, `Challenge entry (${d})`)}
                className="btn bg-red-600 text-lg text-white"
              >
                {d}
              </button>
            ))}
          </div>
          <button
            disabled={busy}
            onClick={undo}
            className="btn-secondary w-full"
          >
            ↩︎ Undo my last transaction (2 min window)
          </button>
        </Card>
      )}

      {tab === "items" && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Puzzle pieces</h2>
          <div className="grid grid-cols-3 gap-2">
            {puzzleItems.map((i) => (
              <button
                key={i.id}
                disabled={busy}
                onClick={() => grantItem(i)}
                className="btn-secondary flex-col py-2 text-xs"
              >
                <span className="text-lg">🧩</span>
                {i.puzzle_location} · {i.puzzle_index}
              </button>
            ))}
          </div>
          <h2 className="pt-2 font-semibold">Facility cards (manual grant)</h2>
          <div className="grid grid-cols-2 gap-2">
            {cardItems.map((i) => (
              <button
                key={i.id}
                disabled={busy}
                onClick={() => grantItem(i)}
                className="btn-secondary py-2 text-xs"
              >
                🎠 {i.name}
              </button>
            ))}
          </div>
        </Card>
      )}

      {tab === "gacha" && (
        <Card className="space-y-3">
          {profile.role !== "gm" ? (
            <p className="text-sm text-ink-faint">
              Bounty Hunter draws are run by station GMs (SRS §2). Guardian
              GMs don&apos;t trigger gacha.
            </p>
          ) : (
            <>
              <div>
                <h2 className="font-semibold">Bounty Hunter — Clue draw</h2>
                <p className="mb-2 text-sm text-ink-faint">
                  Costs the group 2 tokens; yields a clue card.
                </p>
                <button
                  disabled={busy}
                  onClick={() => drawGacha("idea2_clue")}
                  className="btn-primary w-full"
                >
                  🎁 Draw clue (−2 tokens)
                </button>
              </div>
              <div className="pt-2">
                <h2 className="font-semibold">
                  Bounty Hunter — Resource draw
                </h2>
                <p className="mb-2 text-sm text-ink-faint">
                  Only after the group succeeds at the bounty challenge.
                </p>
                <button
                  disabled={busy}
                  onClick={() => drawGacha("idea2_resource")}
                  className="btn-primary w-full"
                >
                  🎰 Draw resources
                </button>
              </div>
            </>
          )}
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

      {gacha && <GachaReveal result={gacha} onClose={() => setGacha(null)} />}
    </div>
  );
}
