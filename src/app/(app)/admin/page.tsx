"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Card,
  ErrorBanner,
  PageTitle,
  SuccessBanner,
} from "@/components/ui";
import { Day2Schedule } from "@/components/admin/Day2Schedule";
import { GameMaster } from "@/components/admin/GameMaster";
import { GameToggles } from "@/components/admin/GameToggles";
import { usePhases } from "@/components/PhaseTimerProvider";
import { useConfig } from "@/components/useConfig";
import { NowOnWelcome } from "@/components/admin/NowOnWelcome";
import { TENNIS_SWITCH } from "@/components/map3d/tennis/settings";
import {
  type AdminDayFilter,
  readAdminDayFilter,
  saveAdminDayFilter,
} from "@/lib/adminDayFilter";
import { reloadSharedFeed, useSharedFeed, type FeedSource } from "@/lib/sharedFeed";
import { supabaseBrowser } from "@/lib/supabase/client";
import { resetGames } from "@/lib/gameLength";
import { cn, friendlyError } from "@/lib/utils";

interface LiveOps {
  tokens_in_circulation: number;
  transactions_count: number;
  blindbox_claims: number;
  blindbox_tokens_in: number;
  pieces_granted: number;
  sets_redeemed: number;
  projectors_activated: number;
}

// FR-11.5 kill-switches + FR-11.6 live ops + FR-10.1 games (GameToggles,
// started and ended by hand), filtered by the Day selector (All / Day 1 / Day 2).
// GameMaster (always live, Admin only): tokens, puzzle pieces, gift blind
// boxes and the funfair's keys, for D-day backup.
function liveOpsSource(): FeedSource<LiveOps> {
  const supabase = supabaseBrowser();
  return {
    async load() {
      const { data } = await supabase.rpc("fn_live_ops");
      return (data as LiveOps | null) ?? undefined;
    },
    pollMs: 10_000,
  };
}

export default function AdminControlRoomPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  // Cached between visits (sharedFeed): the figures show at once and refresh every 10 s.
  const ops = useSharedFeed("fn_live_ops", liveOpsSource) ?? null;
  const { config } = useConfig();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Day filter beside the title: that day's games only (or both with All).
  const { phases } = usePhases();
  const [day, setDay] = useState<AdminDayFilter | null>(null);
  const day1Done = phases.find((p) => p.key === "day1")?.state === "ended";
  const shownDay: AdminDayFilter = day ?? (day1Done ? "Day 2" : "Day 1");

  useEffect(() => {
    const saved = readAdminDayFilter();
    if (saved) setDay(saved);
  }, []);

  const load = useCallback(() => {
    reloadSharedFeed("fn_live_ops");
    reloadSharedFeed("game_config");
  }, []);

  async function toggleConfig(key: string, current: boolean) {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("fn_set_config", {
      p_key: key,
      p_value: !current,
    });
    setBusy(false);
    if (error) setError(friendlyError(error));
    else load();
  }

  function flashNotice(m: string) {
    setNotice(m);
    setTimeout(() => setNotice(null), 3000);
  }

  const boolOf = (k: string) => config[k] === true || config[k] === "true";

  const SWITCHES: { key: string; label: string; danger: string }[] = [
    { key: "tokens_frozen", label: "Freeze Token Mutations", danger: "All GM ± operations rejected" },
    { key: "blindbox_disabled", label: "Pause Blind Box Buying", danger: "Blind box buying paused" },
    { key: "nfc_disabled", label: "Disable NFC Activation", danger: "Sticker taps rejected" },
    { key: "rehearsal_mode", label: "Rehearsal Mode", danger: "Bypasses ALL phase gating. Testing only" },
    { key: "day2_map_layer", label: "Day 2 Map Layer", danger: "Reveals projectors on everyone's map" },
    { key: "nfc_demo_mode", label: "NFC Demo Mode", danger: "Freshies and Facis can light a projector without the card. Testing only" },
  ];

  const onSwitches = SWITCHES.filter((s) => boolOf(s.key));
  // The tennis mini game on the 3D map (docs/ROADMAP.md, item 9): on means open, so it is not an override.
  const tennisOpen = boolOf(TENNIS_SWITCH);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Live Control"
        titleAside={
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Day"
              value={shownDay}
              onChange={(e) => {
                const next = e.target.value as AdminDayFilter;
                setDay(next);
                saveAdminDayFilter(next);
              }}
              className="input min-h-[52px] w-auto py-2 pl-4 pr-10 text-xl font-bold"
            >
              <option value="all">All</option>
              <option value="Day 1">Day 1</option>
              <option value="Day 2">Day 2</option>
            </select>
            {(shownDay === "all" ? (["Day 1", "Day 2"] as const) : [shownDay]).map((d) => (
              <GameToggles key={d} day={d} onError={setError} onNotice={flashNotice} />
            ))}
          </div>
        }
        subtitle={`${shownDay === "all" ? "Both days" : shownDay}: start and end the game. The Welcome page follows the planned schedule times.`}
      />
      <NowOnWelcome onError={setError} onNotice={flashNotice} />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      {onSwitches.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
          <strong>{onSwitches.length} override{onSwitches.length > 1 ? "s" : ""} ON:</strong>{" "}
          {onSwitches.map((s) => s.label).join(" & ")}
        </div>
      )}

      {ops && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {[
            ["Tokens in Circulation", ops.tokens_in_circulation],
            ["Transactions", ops.transactions_count],
            ["Blind Boxes Sold", ops.blindbox_claims],
            ["Box Tokens Paid In", ops.blindbox_tokens_in],
            ["Pieces Granted", ops.pieces_granted],
            ["Sets Redeemed", ops.sets_redeemed],
            ["Projectors Lit", `${ops.projectors_activated}/3`],
          ].map(([label, value]) => (
            <Card key={String(label)} className="p-3 text-center">
              <p className="text-xl font-bold tabular-nums">{String(value)}</p>
              <p className="text-xs text-ink-faint">{label}</p>
            </Card>
          ))}
        </div>
      )}

      <div className="grid items-start gap-4">
        {shownDay !== "Day 1" && <Day2Schedule onError={setError} onNotice={flashNotice} />}
        <GameMaster onError={setError} onNotice={flashNotice} />
        <section>
          <h2 className="mb-2 font-semibold">Mini Game</h2>
          <Card className="p-0">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Tennis on the Map</p>
                <p className="text-xs text-ink-faint">
                  {tennisOpen
                    ? "Open: anyone on the 3D map can tap the tennis court and play. Off ends every match at once."
                    : "Closed: the tennis court has no Play button."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={tennisOpen}
                aria-label="Tennis on the map"
                disabled={busy}
                onClick={() => {
                  if (tennisOpen && !window.confirm("Close tennis? Matches being played end at once, and the queue empties.")) return;
                  toggleConfig(TENNIS_SWITCH, tennisOpen);
                }}
                className={cn(
                  "relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60",
                  tennisOpen ? "bg-emerald-600" : "bg-paper-300"
                )}
              >
                <span
                  className={cn(
                    "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
                    tennisOpen ? "left-6" : "left-1"
                  )}
                />
              </button>
            </div>
          </Card>
        </section>
        <section>
          <h2 className="mb-2 font-semibold">Safety Switches & Testing Overrides</h2>
          <Card className="divide-y divide-paper-200 p-0">
            {SWITCHES.map((s) => {
              const on = boolOf(s.key);
              return (
                <div key={s.key} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{s.label}</p>
                    <p className="text-xs text-ink-faint">{s.danger}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={s.label}
                    disabled={busy}
                    onClick={() => toggleConfig(s.key, on)}
                    className={cn(
                      "relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60",
                      on ? "bg-red-600" : "bg-paper-300"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
                        on ? "left-6" : "left-1"
                      )}
                    />
                  </button>
                </div>
              );
            })}
            {/* Rehearsal only: every game back to Not started (lib/gameLength resetGames). */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Reset Games</p>
                <p className="text-xs text-ink-faint">
                  {boolOf("rehearsal_mode")
                    ? "Day 1, Day 2 and the endgame back to Not started. Every GM moves back to their Day 1 station."
                    : "Locked until Rehearsal mode is on."}
                </p>
              </div>
              <button
                type="button"
                disabled={busy || !boolOf("rehearsal_mode") || phases.every((p) => p.state === "pending")}
                onClick={async () => {
                  if (!window.confirm("Reset every game to Not started? Timers clear and every GM moves back to their Day 1 station. Tokens and pieces are not changed.")) return;
                  setBusy(true);
                  const err = await resetGames(supabase, phases);
                  setBusy(false);
                  if (err) setError(err);
                  else flashNotice("Games reset. Every GM is back on their Day 1 station.");
                }}
                className="btn-secondary min-h-[40px] shrink-0 border-red-300 px-3 text-xs font-semibold text-red-700 disabled:opacity-50"
              >
                Reset
              </button>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
