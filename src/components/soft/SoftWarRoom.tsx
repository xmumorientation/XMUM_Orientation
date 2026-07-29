"use client";

import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import { cn, formatCountdown } from "@/lib/utils";
import type { Phase } from "@/lib/types";

interface LiveOps {
  tokens_in_circulation: number;
  transactions_count: number;
  blindbox_claims: number;
  blindbox_sales: number;
  pieces_granted: number;
  sets_redeemed: number;
  projectors_activated: number;
}

interface Switch {
  key: string;
  label: string;
  danger: string;
}

// Round 4's centered-clock control room, adapted to the real phase model
// (several independently start/pause/end-able phases, not a single
// "advance" button): the active/paused phase becomes the one centered hero
// with its own controls; every other phase collapses into a quiet list
// below instead of matching cards. Kill switches keep their real toggle
// behaviour but drop the always-solid-red block for a calmer pill.
export function SoftWarRoom({
  ops,
  phases,
  busy,
  onPhaseAction,
  switches,
  boolOf,
  onToggle,
}: {
  ops: LiveOps | null;
  phases: Phase[];
  busy: boolean;
  onPhaseAction: (key: string, action: string, minutes?: number) => void;
  switches: Switch[];
  boolOf: (key: string) => boolean;
  onToggle: (key: string, current: boolean) => void;
}) {
  const { offsetMs } = usePhaseTimer();
  const serverNow = Date.now() + offsetMs;

  const active = phases.find((p) => p.state === "active");
  const paused = phases.find((p) => p.state === "paused");
  const current = active ?? paused;
  const others = phases.filter((p) => p.id !== current?.id);
  const enabledCount = switches.filter((s) => boolOf(s.key)).length;

  const remaining = current
    ? current.state === "paused"
      ? (current.paused_remaining ?? 0)
      : current.ends_at
        ? (new Date(current.ends_at).getTime() - serverNow) / 1000
        : 0
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <p className="text-lg font-semibold text-ink">War room</p>
        {ops && (
          <p className="text-sm text-ink-faint">
            {enabledCount} kill-switch{enabledCount === 1 ? "" : "es"} on
          </p>
        )}
      </div>

      {/* Centered focal card — the one thing an admin acts on under pressure */}
      <div className="flex flex-col items-center rounded-3xl bg-white p-8 text-center shadow-floating">
        {current ? (
          <>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-ink-faint">
              {current.state === "paused" ? "Paused" : "Current phase"}
            </p>
            <p className="mt-3 text-2xl font-black tracking-tight">
              {current.name}
            </p>
            <p
              className={cn(
                "mt-2 font-mono text-6xl font-black tabular-nums lg:text-7xl",
                current.is_endgame && "text-red-600"
              )}
            >
              {formatCountdown(remaining)}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button
                disabled={busy}
                onClick={() =>
                  onPhaseAction(
                    current.key,
                    current.state === "paused" ? "resume" : "pause"
                  )
                }
                className="btn-primary min-h-[52px] px-6"
              >
                {current.state === "paused" ? "Resume" : "Pause"}
              </button>
              <button
                disabled={busy}
                onClick={() => onPhaseAction(current.key, "extend", 5)}
                className="btn-secondary min-h-[52px]"
              >
                +5 min
              </button>
              <button
                disabled={busy}
                onClick={() => onPhaseAction(current.key, "end")}
                className="btn-secondary min-h-[52px] text-red-600"
              >
                End phase
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-ink-faint">
              No phase running
            </p>
            <p className="mt-3 max-w-[36ch] text-sm text-ink-faint">
              Nothing advances on its own. Start the next phase below when
              you&rsquo;re ready.
            </p>
          </>
        )}
      </div>

      {ops && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-white px-5 py-4 text-sm shadow-raised">
          {[
            ["Tokens in circulation", ops.tokens_in_circulation],
            ["Transactions", ops.transactions_count],
            ["Blind boxes opened", ops.blindbox_claims],
            ["GM boxes sold", ops.blindbox_sales],
            ["Pieces granted", ops.pieces_granted],
            ["Sets redeemed", ops.sets_redeemed],
            ["Projectors revived", `${ops.projectors_activated}/3`],
          ].map(([label, value]) => (
            <span key={String(label)}>
              <span className="font-mono font-black tabular-nums">
                {String(value)}
              </span>{" "}
              <span className="text-ink-faint">{label}</span>
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl bg-white shadow-raised">
          <p className="px-5 pt-4 text-xs font-black uppercase tracking-[0.15em] text-ink-faint">
            Other phases
          </p>
          <div className="mt-2 divide-y divide-paper-100">
            {others.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-ink-faint">
                    {p.duration_minutes} min · {p.state}
                  </p>
                </div>
                {p.state === "pending" && (
                  <button
                    disabled={busy}
                    onClick={() => onPhaseAction(p.key, "start")}
                    className="btn-secondary min-h-[36px] shrink-0 px-3 text-xs"
                  >
                    Start
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-raised">
          <p className="px-5 pt-4 text-xs font-black uppercase tracking-[0.15em] text-ink-faint">
            Kill switches
          </p>
          <div className="mt-2 divide-y divide-paper-100">
            {switches.map((s) => {
              const on = boolOf(s.key);
              return (
                <div
                  key={s.key}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{s.label}</p>
                    <p className="text-xs text-ink-faint">{s.danger}</p>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => onToggle(s.key, on)}
                    className={cn(
                      "min-h-[32px] shrink-0 rounded-full px-3 text-xs font-bold",
                      on
                        ? "bg-red-50 text-red-700"
                        : "border border-paper-300 text-ink-faint"
                    )}
                  >
                    {on ? "ON" : "off"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
