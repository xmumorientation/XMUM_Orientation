"use client";

import { CheckCircle2, Trophy, Users, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { useConfig } from "@/components/useConfig";
import { ErrorBanner, SuccessBanner } from "@/components/ui";
import { InputBox, LoadingState, PageHeader, SectionCard } from "@/components/ui/Shared";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";

interface GroupOption { id: number; name: string }
interface Day1Station { id: number; code: string; name: string }
interface PendingResult { winnerId: number | null; loserId: number | null; requestId: string }
interface SubmitResult { duplicate?: boolean; winner_reward: number; loser_reward: number }

function normalizeGroup(value: string): number | null | "invalid" {
  const clean = value.trim();
  if (!clean || clean === "-") return null;
  const id = Number(clean);
  return Number.isInteger(id) && id > 0 ? id : "invalid";
}

export default function GmDay1Page() {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { config, loaded: configLoaded } = useConfig();
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [station, setStation] = useState<Day1Station | null>(null);
  const [loading, setLoading] = useState(true);
  const [winner, setWinner] = useState("");
  const [loser, setLoser] = useState("");
  const [pending, setPending] = useState<PendingResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const winReward = Number(config.day1_win_reward ?? 0);
  const loseReward = Number(config.day1_lose_reward ?? 0);

  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: groupRows }, { data: assignment }] = await Promise.all([
        supabase.rpc("fn_list_groups"),
        supabase.from("gm_station_assignments").select("station_id").eq("user_id", profile.id).eq("day", 1).maybeSingle(),
      ]);
      if (!active) return;
      setGroups((groupRows as GroupOption[]) ?? []);
      if (assignment?.station_id) {
        const { data: stationRow } = await supabase.from("stations").select("id,code,name").eq("id", assignment.station_id).maybeSingle();
        if (active) setStation((stationRow as Day1Station | null) ?? null);
      }
      if (active) setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [profile.id, supabase]);

  function groupLabel(id: number | null) {
    if (id === null) return "—";
    return groups.find((group) => group.id === id)?.name ?? `Group ${id}`;
  }

  function prepareConfirmation() {
    setError(null);
    setSuccess(null);
    const winnerId = normalizeGroup(winner);
    const loserId = normalizeGroup(loser);
    if (winnerId === "invalid" || loserId === "invalid") return setError("Enter a valid group number or use - for an empty field.");
    if (winnerId === null && loserId === null) return setError("Enter at least one winner or loser group.");
    if (winnerId !== null && winnerId === loserId) return setError("The winner and loser cannot be the same group.");
    if (winnerId !== null && !groups.some((group) => group.id === winnerId)) return setError(`Group ${winnerId} does not exist.`);
    if (loserId !== null && !groups.some((group) => group.id === loserId)) return setError(`Group ${loserId} does not exist.`);
    if (!station) return setError("Your Day 1 station has not been assigned yet.");
    if (!Number.isFinite(winReward) || !Number.isFinite(loseReward) || winReward < 0 || loseReward < 0) return setError("Day 1 rewards have not been configured correctly.");
    setPending({ winnerId, loserId, requestId: crypto.randomUUID() });
  }

  async function confirmResult() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    const { data, error: submitError } = await supabase.rpc("fn_submit_day1_result", {
      p_winner_group_id: pending.winnerId,
      p_loser_group_id: pending.loserId,
      p_request_id: pending.requestId,
    });
    setBusy(false);
    if (submitError) return setError(friendlyError(submitError));
    const result = data as SubmitResult;
    setPending(null);
    setWinner("");
    setLoser("");
    setSuccess(result.duplicate ? "This result was already submitted. No rewards were duplicated." : "Day 1 result submitted and Token rewards applied.");
  }

  if (loading || !configLoaded) return <LoadingState label="Loading Day 1 station" />;

  return (
    <div className="space-y-4">
      <PageHeader title="Day 1" subtitle={station ? `${station.code} · ${station.name}` : "No Day 1 station assigned"} />
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />
      {!station && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-black">Station assignment required</p><p className="mt-1">Ask an Admin to assign this GM account to a Day 1 station.</p></div>}

      <SectionCard title="Winner" description={`Configured reward: +${winReward} tokens`}>
        <div className="flex items-center gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-green-100 text-green-700"><Trophy size={23} /></span><InputBox id="winner-group" aria-label="Winner group number" inputMode="numeric" placeholder="Group number or -" value={winner} onChange={(event) => setWinner(event.target.value)} className="min-h-[56px] text-lg font-black" /></div>
      </SectionCard>
      <SectionCard title="Loser" description={`Configured reward: +${loseReward} tokens`}>
        <div className="flex items-center gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-paper-200 text-ink-soft"><Users size={23} /></span><InputBox id="loser-group" aria-label="Loser group number" inputMode="numeric" placeholder="Group number or -" value={loser} onChange={(event) => setLoser(event.target.value)} className="min-h-[56px] text-lg font-black" /></div>
      </SectionCard>
      <button type="button" disabled={busy || !station} onClick={prepareConfirmation} className="btn min-h-[64px] w-full bg-green-600 text-lg font-black text-white shadow-card hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">Review and submit</button>

      {pending && <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-3 backdrop-blur-sm sm:items-center"><div role="dialog" aria-modal="true" aria-labelledby="day1-confirm-title" className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl"><p className="text-xs font-black uppercase tracking-[0.16em] text-brand-1">{station?.code ?? "Station"}</p><h2 id="day1-confirm-title" className="mt-1 text-2xl font-black">Confirm Day 1 result</h2><div className="mt-5 space-y-3">{pending.winnerId !== null && <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4"><CheckCircle2 className="text-green-700" /><div className="flex-1"><p className="font-black">{groupLabel(pending.winnerId)}</p><p className="text-xs font-bold uppercase text-green-700">Win</p></div><p className="text-lg font-black text-green-700">+{winReward}</p></div>}{pending.loserId !== null && <div className="flex items-center gap-3 rounded-2xl border border-paper-300 bg-paper-100 p-4"><XCircle className="text-ink-soft" /><div className="flex-1"><p className="font-black">{groupLabel(pending.loserId)}</p><p className="text-xs font-bold uppercase text-ink-faint">Lose</p></div><p className="text-lg font-black text-ink">+{loseReward}</p></div>}</div><p className="mt-4 text-sm text-ink-faint">Confirm the group numbers carefully. Corrections must be made later through the Admin Token Log.</p><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" disabled={busy} onClick={() => setPending(null)} className="btn-secondary min-h-[52px]">Back</button><button type="button" disabled={busy} onClick={confirmResult} className="btn min-h-[52px] bg-green-600 font-black text-white disabled:opacity-50">{busy ? "Submitting…" : "Confirm"}</button></div></div></div>}
    </div>
  );
}
