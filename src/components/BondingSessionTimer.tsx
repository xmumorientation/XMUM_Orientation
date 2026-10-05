"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import { useCurrentUserContext } from "@/components/ProfileProvider";
import { useToast } from "@/components/ToastProvider";
import { useConfig } from "@/components/useConfig";
import {
  DangerButton,
  InputBox,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from "@/components/ui/Shared";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Phase } from "@/lib/types";
import { cn, formatCountdown, friendlyError } from "@/lib/utils";

type SessionAction = "start" | "pause" | "resume" | "extend" | "reset" | "end";

function remainingSeconds(phase: Phase, serverNow: number) {
  if (phase.state === "paused") return Math.max(0, phase.paused_remaining ?? 0);
  if (phase.state === "pending") return Math.max(0, phase.duration_minutes * 60);
  if (phase.state !== "active" || !phase.ends_at) return 0;
  return Math.max(0, (new Date(phase.ends_at).getTime() - serverNow) / 1000);
}

function statusOf(phase: Phase, remaining: number) {
  return phase.state === "active" && remaining <= 0 ? "ended" : phase.state;
}

export function BondingSessionTimer() {
  const { role } = useCurrentUserContext();
  const { phases, offsetMs, tick } = usePhaseTimer();
  const { config } = useConfig();
  const toast = useToast();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const sessions = phases.filter((phase) => phase.key === "day1" || phase.key === "day2");
  const [selectedKey, setSelectedKey] = useState("day1");
  const [extendMinutes, setExtendMinutes] = useState("5");
  const [busy, setBusy] = useState<SessionAction | null>(null);
  const finalized = useRef(new Set<number>());
  void tick;

  const selected = sessions.find((phase) => phase.key === selectedKey) ?? sessions[0];
  const serverNow = Date.now() + offsetMs;
  const configuredMinutes = Number(config[`bonding_session_duration_${selected?.key}`] ?? selected?.duration_minutes ?? 0);
  const remaining = selected?.state === "pending" ? Math.max(0, configuredMinutes * 60) : selected ? remainingSeconds(selected, serverNow) : 0;
  const status = selected ? statusOf(selected, remaining) : "pending";
  const warning = status === "active" && remaining <= 30 * 60;

  useEffect(() => {
    const expired = sessions.filter(
      (phase) => phase.state === "active" && remainingSeconds(phase, Date.now() + offsetMs) <= 0
    );
    if (!expired.some((phase) => !finalized.current.has(phase.id))) return;
    expired.forEach((phase) => finalized.current.add(phase.id));
    void supabase.rpc("fn_finalize_expired_sessions");
  }, [offsetMs, sessions, supabase, tick]);

  async function control(action: SessionAction) {
    if (!selected || busy) return;
    const minutes = Number(extendMinutes);
    if (action === "extend" && (!Number.isInteger(minutes) || minutes <= 0)) {
      toast({ tone: "error", message: "Enter a positive whole number of minutes." });
      return;
    }
    if ((action === "reset" || action === "end") && !window.confirm(
      action === "reset"
        ? `Reset ${selected.name}? The current countdown will be cleared.`
        : `End ${selected.name} now? Normal gameplay actions will be locked.`
    )) return;

    setBusy(action);
    const { error } = await supabase.rpc("fn_phase_control", {
      p_phase_key: selected.key,
      p_action: action,
      p_extend_minutes: action === "extend" ? minutes : 0,
    });
    setBusy(null);
    if (error) {
      toast({ tone: "error", message: friendlyError(error) });
      return;
    }
    const label: Record<SessionAction, string> = {
      start: "started", pause: "paused", resume: "resumed",
      extend: `extended by ${minutes} minutes`, reset: "reset", end: "ended",
    };
    toast({ tone: "success", message: `${selected.name} ${label[action]}.` });
  }

  if (!selected) {
    return <p className="py-10 text-center text-sm text-ink-faint">Timer configuration is unavailable.</p>;
  }

  const badgeTone = status === "active" ? "success" : status === "paused" ? "warning" : "neutral";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Bonding day">
        {sessions.map((phase) => (
          <SecondaryButton
            key={phase.id}
            role="tab"
            aria-selected={phase.key === selected.key}
            onClick={() => setSelectedKey(phase.key)}
            className={cn(
              phase.state === "active" && "border-green-600 bg-green-600 text-white hover:bg-green-700",
              phase.state === "paused" && "border-amber-500 bg-amber-100 text-amber-900",
              phase.key === selected.key && phase.state !== "active" && "ring-2 ring-brand-1/40"
            )}
          >
            {phase.name}
          </SecondaryButton>
        ))}
      </div>

      <div className={cn(
        "rounded-[2rem] border px-5 py-10 text-center shadow-soft transition-colors",
        warning ? "border-red-300 bg-red-50 text-red-700" : "border-paper-200 bg-white text-ink"
      )}>
        <div className="mb-5 flex items-center justify-center gap-2">
          <p className="text-xs font-black uppercase tracking-[0.2em]">{selected.name}</p>
          <StatusBadge tone={badgeTone}>{status.toUpperCase()}</StatusBadge>
        </div>
        <p className="font-mono text-6xl font-black tabular-nums tracking-tight sm:text-7xl">
          {formatCountdown(remaining)}
        </p>
        <p className="mt-4 text-sm font-semibold opacity-75">
          {status === "pending" && "Configured countdown — waiting for Admin to start."}
          {status === "paused" && "The bonding session is currently paused."}
          {status === "ended" && "The bonding session has ended."}
          {status === "active" && warning && "Final 30 minutes."}
          {status === "active" && !warning && "Session in progress."}
        </p>
      </div>

      {role === "admin" && (
        <div className="space-y-3 rounded-3xl border border-paper-200 bg-paper-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-ink-faint">Admin controls</p>
          <div className="grid grid-cols-2 gap-2">
            <PrimaryButton loading={busy === "start"} disabled={status === "active" || status === "paused"} onClick={() => control("start")}>Start</PrimaryButton>
            <SecondaryButton loading={busy === "pause"} disabled={status !== "active"} onClick={() => control("pause")}>Pause</SecondaryButton>
            <PrimaryButton loading={busy === "resume"} disabled={status !== "paused"} onClick={() => control("resume")}>Resume</PrimaryButton>
            <DangerButton loading={busy === "end"} disabled={status === "ended" || status === "pending"} onClick={() => control("end")}>End</DangerButton>
          </div>
          <div className="flex items-end gap-2">
            <InputBox label="Extend by minutes" type="number" min={1} step={1} value={extendMinutes} onChange={(event) => setExtendMinutes(event.target.value)} className="tabular-nums" />
            <SecondaryButton loading={busy === "extend"} disabled={status !== "active" && status !== "paused"} onClick={() => control("extend")}>Extend</SecondaryButton>
          </div>
          <DangerButton fullWidth loading={busy === "reset"} onClick={() => control("reset")}>Reset session</DangerButton>
        </div>
      )}
    </div>
  );
}
