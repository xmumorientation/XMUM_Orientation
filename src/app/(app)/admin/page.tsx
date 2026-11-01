"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { TriangleAlert } from "lucide-react";

import {
  Card,
  ErrorBanner,
  PageTitle,
  SuccessBanner,
  WarningBanner,
} from "@/components/ui";
import { Day2Schedule } from "@/components/admin/Day2Schedule";
import { GameMaster } from "@/components/admin/GameMaster";
import { GameToggles } from "@/components/admin/GameToggles";
import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import { NowOnWelcome } from "@/components/admin/NowOnWelcome";
import {
  type AdminDayFilter,
  readAdminDayFilter,
  saveAdminDayFilter,
} from "@/lib/adminDayFilter";
import { supabaseBrowser } from "@/lib/supabase/client";
import { resetGames } from "@/lib/gameLength";
import { friendlyError } from "@/lib/utils";

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
export default function AdminControlRoomPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [ops, setOps] = useState<LiveOps | null>(null);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Day filter beside the title: that day's games only (or both with All).
  const { phases } = usePhaseTimer();
  const [day, setDay] = useState<AdminDayFilter | null>(null);
  const day1Done = phases.find((p) => p.key === "day1")?.state === "ended";
  const shownDay: AdminDayFilter = day ?? (day1Done ? "Day 2" : "Day 1");

  useEffect(() => {
    const saved = readAdminDayFilter();
    if (saved) setDay(saved);
  }, []);

  const load = useCallback(async () => {
    const [{ data: o }, { data: cfg }] = await Promise.all([
      supabase.rpc("fn_live_ops"),
      supabase.from("game_config").select("key, value"),
    ]);
    if (o) setOps(o as LiveOps);
    if (cfg) {
      const map: Record<string, unknown> = {};
      for (const row of cfg) {
        map[(row as { key: string }).key] = (row as { value: unknown }).value;
      }
      setConfig(map);
    }
  }, [supabase]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, [load]);

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
    { key: "tokens_frozen", label: "Freeze token mutations", danger: "All GM ± operations rejected" },
    { key: "blindbox_disabled", label: "Pause blind box buying", danger: "Blind box buying paused" },
    { key: "nfc_disabled", label: "Disable NFC activation", danger: "Sticker taps rejected" },
    { key: "rehearsal_mode", label: "Rehearsal mode", danger: "Bypasses ALL phase gating. Testing only" },
    { key: "day2_map_layer", label: "Day 2 map layer", danger: "Reveals projectors on everyone's map" },
    { key: "nfc_demo_mode", label: "NFC demo mode", danger: "Freshies and Facis can light a projector without the card. Testing only" },
  ];

  const onSwitches = SWITCHES.filter((s) => boolOf(s.key));

  return (
    <div className="space-y-4">
      <PageTitle
        title="Live control"
        titleAside={
          <select
            aria-label="Day"
            value={shownDay}
            onChange={(e) => {
              const next = e.target.value as AdminDayFilter;
              setDay(next);
              saveAdminDayFilter(next);
            }}
            className="input av-day w-auto py-2 pl-4 pr-10 text-xl font-bold"
          >
            <option value="all">All</option>
            <option value="Day 1">Day 1</option>
            <option value="Day 2">Day 2</option>
          </select>
        }
        subtitle={`${shownDay === "all" ? "Both days" : shownDay}: start and end the game. The Welcome page follows the planned schedule times.`}
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      {onSwitches.length > 0 && (
        <WarningBanner>
          <strong>{onSwitches.length} override{onSwitches.length > 1 ? "s" : ""} ON:</strong>{" "}
          {onSwitches.map((s) => s.label).join(" & ")}
        </WarningBanner>
      )}

      <div className="av-games">
        {(shownDay === "all" ? (["Day 1", "Day 2"] as const) : [shownDay]).map((d) => (
          <GameToggles key={d} day={d} onError={setError} onNotice={flashNotice} />
        ))}
      </div>
      <NowOnWelcome onError={setError} onNotice={flashNotice} />

      {ops ? (
        <div className="av-tiles">
          {[
            ["Tokens in circulation", ops.tokens_in_circulation],
            ["Transactions", ops.transactions_count],
            ["Blind boxes sold", ops.blindbox_claims],
            ["Box tokens paid in", ops.blindbox_tokens_in],
            ["Pieces granted", ops.pieces_granted],
            ["Sets redeemed", ops.sets_redeemed],
            ["Projectors lit", `${ops.projectors_activated}/3`],
          ].map(([label, value]) => (
            <Card key={String(label)} variant="raised" className="av-tile">
              <p className="av-tile-value tabular-nums">{String(value)}</p>
              <p className="av-tile-label">{label}</p>
            </Card>
          ))}
        </div>
      ) : (
        <div className="av-tiles" aria-hidden>
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="av-skel av-tile" />
          ))}
        </div>
      )}

      <div className="grid items-start gap-4">
        {shownDay !== "Day 1" && <Day2Schedule onError={setError} onNotice={flashNotice} />}
        <GameMaster onError={setError} onNotice={flashNotice} />

        {/* Danger zone: the six kill-switches and overrides, and Reset games. Nothing safe lives here. */}
        <section aria-labelledby="av-danger-title" className="av-danger">
          <header className="av-danger-head">
            <TriangleAlert size={22} aria-hidden />
            <h2 id="av-danger-title">Danger zone</h2>
            <span>{onSwitches.length} of {SWITCHES.length} ON</span>
          </header>
          {SWITCHES.map((s) => {
            const on = boolOf(s.key);
            return (
              <div key={s.key} className="av-danger-row">
                <div className="min-w-0 flex-1">
                  <p className="av-danger-label">{s.label}</p>
                  <p className="av-danger-why">{s.danger}</p>
                </div>
                <span className="av-state" data-on={on}>{on ? "ON" : "OFF"}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={s.label}
                  disabled={busy}
                  onClick={() => toggleConfig(s.key, on)}
                  className="av-switch"
                >
                  <i />
                </button>
              </div>
            );
          })}
          {/* Rehearsal only: every game back to Not started (lib/gameLength resetGames). */}
          <div className="av-danger-row av-danger-reset">
            <div className="min-w-0 flex-1">
              <p className="av-danger-label">Reset games</p>
              <p className="av-danger-why">
                {!boolOf("rehearsal_mode")
                  ? "Locked until Rehearsal mode is on."
                  : phases.every((p) => p.state === "pending")
                    ? "Every game is already Not started."
                    : "Day 1, Day 2 and the endgame back to Not started. Every GM moves back to their Day 1 station."}
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
              className="av-btn-danger"
            >
              Reset games
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
