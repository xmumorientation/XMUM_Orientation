"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Card,
  ErrorBanner,
  PageTitle,
  SuccessBanner,
} from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Phase } from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

interface LiveOps {
  tokens_in_circulation: number;
  transactions_count: number;
  blindbox_claims: number;
  blindbox_sales: number;
  pieces_granted: number;
  sets_redeemed: number;
  projectors_activated: number;
}

// FR-11.5 kill-switches + FR-11.6 live ops + FR-10.1 phase control.
export default function AdminControlRoomPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [ops, setOps] = useState<LiveOps | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: o }, { data: ph }, { data: cfg }] = await Promise.all([
      supabase.rpc("fn_live_ops"),
      supabase.from("phases").select("*").order("sort_order"),
      supabase.from("game_config").select("key, value"),
    ]);
    if (o) setOps(o as LiveOps);
    if (ph) setPhases(ph as Phase[]);
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

  async function phaseAction(key: string, action: string, minutes = 0) {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("fn_phase_control", {
      p_phase_key: key,
      p_action: action,
      p_extend_minutes: minutes,
    });
    setBusy(false);
    if (error) setError(friendlyError(error));
    else {
      setNotice(`Phase "${key}": ${action}`);
      load();
    }
  }

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

  const boolOf = (k: string) => config[k] === true || config[k] === "true";

  const SWITCHES: { key: string; label: string; danger: string }[] = [
    { key: "tokens_frozen", label: "Freeze token mutations", danger: "All GM ± operations rejected" },
    { key: "blindbox_disabled", label: "Disable blind box", danger: "All scans & sells rejected" },
    { key: "nfc_disabled", label: "Disable NFC activation", danger: "Sticker taps rejected" },
    { key: "rehearsal_mode", label: "Rehearsal mode", danger: "Bypasses ALL phase gating. Testing only" },
    { key: "day2_map_layer", label: "Day 2 map layer", danger: "Reveals projectors on everyone's map" },
  ];

  const onSwitches = SWITCHES.filter((s) => boolOf(s.key));

  return (
    <div className="space-y-4">
      <PageTitle title="Control room" subtitle="Live ops, phases & kill-switches" />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      {onSwitches.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
          <strong>{onSwitches.length} kill-switch{onSwitches.length > 1 ? "es" : ""} ON:</strong>{" "}
          {onSwitches.map((s) => s.label).join(" · ")}
        </div>
      )}

      {ops && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {[
            ["Tokens in circulation", ops.tokens_in_circulation],
            ["Transactions", ops.transactions_count],
            ["Blind boxes opened", ops.blindbox_claims],
            ["GM boxes sold", ops.blindbox_sales],
            ["Pieces granted", ops.pieces_granted],
            ["Sets redeemed", ops.sets_redeemed],
            ["Projectors revived", `${ops.projectors_activated}/3`],
          ].map(([label, value]) => (
            <Card key={String(label)} className="p-3 text-center">
              <p className="text-xl font-bold tabular-nums">{String(value)}</p>
              <p className="text-xs text-ink-faint">{label}</p>
            </Card>
          ))}
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
        <section>
          <h2 className="mb-2 font-semibold">Phase control</h2>
          <Card className="divide-y divide-paper-200 p-0">
            {phases.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
              >
                <div className="min-w-[10rem] flex-1">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-ink-faint">{p.duration_minutes} min</p>
                </div>
                <span
                  className={cn(
                    "chip w-20 justify-center",
                    p.state === "active"
                      ? "bg-green-100 text-green-800"
                      : p.state === "paused"
                        ? "bg-amber-100 text-amber-800"
                        : p.state === "ended"
                          ? "bg-gray-200 text-gray-600"
                          : "bg-paper-200 text-ink-soft"
                  )}
                >
                  {p.state}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    disabled={busy}
                    onClick={() => phaseAction(p.key, "start")}
                    className="btn-secondary min-h-[36px] px-3 text-xs"
                  >
                    ▶ Start
                  </button>
                  <button
                    disabled={busy || p.state !== "active"}
                    onClick={() => phaseAction(p.key, "pause")}
                    className="btn-secondary min-h-[36px] px-3 text-xs"
                  >
                    ⏸ Pause
                  </button>
                  <button
                    disabled={busy || p.state !== "paused"}
                    onClick={() => phaseAction(p.key, "resume")}
                    className="btn-secondary min-h-[36px] px-3 text-xs"
                  >
                    ⏵ Resume
                  </button>
                  <button
                    disabled={busy || p.state !== "active"}
                    onClick={() => phaseAction(p.key, "extend", 5)}
                    className="btn-secondary min-h-[36px] px-3 text-xs"
                  >
                    +5 min
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => phaseAction(p.key, "end")}
                    className="btn-danger min-h-[36px] px-3 text-xs"
                  >
                    ■ End
                  </button>
                </div>
              </div>
            ))}
            {phases.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-ink-faint">No phases yet.</p>
            )}
          </Card>
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Kill-switches</h2>
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
          </Card>
        </section>
      </div>
    </div>
  );
}
