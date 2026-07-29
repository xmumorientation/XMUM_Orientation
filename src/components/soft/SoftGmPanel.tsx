"use client";

import { StationStatusChip } from "@/components/ui";
import {
  PROJECTOR_LABELS,
  PROJECTOR_LOCATIONS,
  RISK_TIER_META,
  type ProjectorLocation,
  type Station,
  type StationStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "day1" | "day2" | "box" | "station";

const TASKS: Record<Tab, { title: string; desc: string }> = {
  day1: { title: "Day 1", desc: "Award station result" },
  day2: { title: "Day 2", desc: "Charge entry and grant piece" },
  box: { title: "Box", desc: "Sell GM blind box" },
  station: { title: "Status", desc: "Update queue state" },
};

// Same tabs, state and RPC calls as the classic panel — only the chrome
// changes: quieter offline/error banners, one rounded card per task instead
// of borders everywhere, and the sticky group picker as a soft pill.
export function SoftGmPanel({
  station,
  tier,
  queueLength,
  failed,
  onDismissFailed,
  error,
  notice,
  groups,
  groupId,
  onGroupChange,
  tab,
  onTabChange,
  busy,
  onDay1Reward,
  onUndo,
  success,
  onSetSuccess,
  needPicks,
  locations,
  onToggleLocation,
  onSubmitDay2,
  boxPrice,
  boxStock,
  boxesSold,
  onSellBox,
  onSetStatus,
}: {
  station: Station | null;
  tier: keyof typeof RISK_TIER_META;
  queueLength: number;
  failed: { id: string; label: string; error: string }[];
  onDismissFailed: (id: string) => void;
  error: string | null;
  notice: string | null;
  groups: { id: number; name: string }[];
  groupId: number | null;
  onGroupChange: (id: number | null) => void;
  tab: Tab;
  onTabChange: (t: Tab) => void;
  busy: boolean;
  onDay1Reward: (delta: number, reason: string) => void;
  onUndo: () => void;
  success: boolean;
  onSetSuccess: (v: boolean) => void;
  needPicks: number;
  locations: ProjectorLocation[];
  onToggleLocation: (loc: ProjectorLocation) => void;
  onSubmitDay2: () => void;
  boxPrice: number;
  boxStock: number;
  boxesSold: number;
  onSellBox: () => void;
  onSetStatus: (status: StationStatus) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="px-1">
        <p className="text-lg font-semibold text-ink">Station panel</p>
        {station && (
          <p className="text-sm text-ink-faint">
            {station.name} · {RISK_TIER_META[tier].label} (entry{" "}
            {station.entry_cost})
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </div>
      )}

      {queueLength > 0 && (
        <div className="flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-900 text-xs font-black text-white">
            {queueLength}
          </span>
          <p>
            Offline — queued submission{queueLength > 1 ? "s" : ""} will send
            themselves when signal returns.
          </p>
        </div>
      )}

      {failed.length > 0 && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-bold">
            {failed.length} queued submission{failed.length > 1 ? "s" : ""}{" "}
            rejected
          </p>
          <ul className="mt-2 space-y-1">
            {failed.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2">
                <span>
                  {f.label} — {f.error}
                </span>
                <button
                  type="button"
                  className="shrink-0 rounded-full border border-red-300 px-2 py-1 text-xs font-bold"
                  onClick={() => onDismissFailed(f.id)}
                >
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="sticky top-[8.75rem] z-20 rounded-2xl bg-white p-4 shadow-floating">
        <label className="label" htmlFor="soft-group">
          Active group
        </label>
        <select
          id="soft-group"
          className="input rounded-full text-lg font-bold"
          value={groupId ?? ""}
          onChange={(e) => onGroupChange(Number(e.target.value) || null)}
        >
          <option value="">Select group…</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-3xl bg-paper-100 p-1.5 sm:grid-cols-4">
        {(Object.keys(TASKS) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            className={cn(
              "min-h-[72px] rounded-2xl px-3 text-left transition active:scale-[0.99]",
              tab === t
                ? "bg-white text-ink shadow-raised"
                : "text-ink-faint hover:bg-white/50"
            )}
          >
            <span className="block text-sm font-black">{TASKS[t].title}</span>
            <span className="mt-1 block text-xs leading-4">
              {TASKS[t].desc}
            </span>
          </button>
        ))}
      </div>

      {tab === "day1" && (
        <div className="space-y-4 rounded-3xl bg-white p-5 shadow-raised">
          <div>
            <h2 className="font-semibold">Day 1 rewards</h2>
            <p className="text-sm text-ink-faint">
              Confirm the active group, then tap a result.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={busy}
              onClick={() => onDay1Reward(2, "Station win")}
              className="btn min-h-[92px] flex-col rounded-2xl bg-green-600 text-white"
            >
              <span className="text-2xl font-black">+2</span>
              <span className="text-sm">Win</span>
            </button>
            <button
              disabled={busy}
              onClick={() => onDay1Reward(1, "Station participation")}
              className="btn min-h-[92px] flex-col rounded-2xl bg-green-500 text-white"
            >
              <span className="text-2xl font-black">+1</span>
              <span className="text-sm">Participation</span>
            </button>
          </div>
          <button disabled={busy} onClick={onUndo} className="btn-secondary w-full">
            Undo my last transaction (2 min window)
          </button>
        </div>
      )}

      {tab === "day2" && (
        <div className="space-y-4 rounded-3xl bg-white p-5 shadow-raised">
          <div>
            <h2 className="font-semibold">Day 2 challenge result</h2>
            <p className="text-sm text-ink-faint">
              {RISK_TIER_META[tier].label}: {RISK_TIER_META[tier].desc}. Entry
              fee -{station?.entry_cost ?? "?"} is charged win or lose.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onSetSuccess(true)}
              className={cn(
                "btn min-h-[76px] flex-col rounded-2xl text-base",
                success
                  ? "bg-green-600 text-white"
                  : "border border-paper-300 bg-white text-ink-soft"
              )}
            >
              <span className="text-xl font-black">Success</span>
              <span className="text-xs">Charge + grant</span>
            </button>
            <button
              onClick={() => onSetSuccess(false)}
              className={cn(
                "btn min-h-[76px] flex-col rounded-2xl text-base",
                !success
                  ? "bg-red-600 text-white"
                  : "border border-paper-300 bg-white text-ink-soft"
              )}
            >
              <span className="text-xl font-black">Failed</span>
              <span className="text-xs">Charge only</span>
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
                    onClick={() => onToggleLocation(loc)}
                    className={cn(
                      "btn min-h-[64px] rounded-2xl text-sm",
                      locations.includes(loc)
                        ? "bg-brand-2 text-white"
                        : "border border-paper-300 bg-white"
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
            onClick={onSubmitDay2}
            className="btn-primary min-h-[64px] w-full text-lg"
          >
            Submit (-{station?.entry_cost ?? "?"} tokens
            {success ? " + piece" : ""})
          </button>
          {!station && (
            <p className="text-sm text-red-600">
              No station assigned to your account. Ask Admin.
            </p>
          )}
        </div>
      )}

      {tab === "box" && (
        <div className="space-y-3 rounded-3xl bg-white p-5 shadow-raised">
          <h2 className="font-semibold">Sell a blind box</h2>
          <p className="text-sm text-ink-faint">
            Price -{boxPrice} tokens. Limited stock:{" "}
            {Math.max(0, boxStock - boxesSold)} of {boxStock} left (shared
            across all GMs).
          </p>
          <button
            disabled={busy || boxesSold >= boxStock}
            onClick={onSellBox}
            className="btn-primary min-h-[72px] w-full text-lg"
          >
            Sell and open (-{boxPrice} tokens)
          </button>
        </div>
      )}

      {tab === "station" && (
        <div className="space-y-3 rounded-3xl bg-white p-5 shadow-raised">
          {station ? (
            <>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{station.name}</span>
                <StationStatusChip status={station.status} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  disabled={busy}
                  onClick={() => onSetStatus("available")}
                  className="btn min-h-[72px] rounded-2xl bg-green-600 text-sm text-white"
                >
                  Available
                </button>
                <button
                  disabled={busy}
                  onClick={() => onSetStatus("in_progress")}
                  className="btn min-h-[72px] rounded-2xl bg-red-600 text-sm text-white"
                >
                  Busy
                </button>
                <button
                  disabled={busy}
                  onClick={() => onSetStatus("closed")}
                  className="btn min-h-[72px] rounded-2xl bg-gray-500 text-sm text-white"
                >
                  Closed
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-faint">
              No station assigned to your account. Ask Admin to set your
              station.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
