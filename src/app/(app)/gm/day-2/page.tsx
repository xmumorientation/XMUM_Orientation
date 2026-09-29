"use client";

import { Coins, MapPin, ShieldCheck, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { ErrorBanner } from "@/components/ui";
import { InputBox, LoadingState, PageHeader, SectionCard, StatusBadge } from "@/components/ui/Shared";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";

interface GroupOption { id: number; name: string }
interface Day2Station { id: number; code: string; name: string; difficulty: "EASY"|"MEDIUM"|"HARD"; token_cost: number; location_exclusion_limit: number; is_active: boolean }

export default function GmDay2Page() {
  const profile=useProfile(); const router=useRouter(); const supabase=useMemo(()=>supabaseBrowser(),[]);
  const [groups,setGroups]=useState<GroupOption[]>([]),[station,setStation]=useState<Day2Station|null>(null);
  const [groupValue,setGroupValue]=useState(""),[pendingGroup,setPendingGroup]=useState<number|null>(null);
  const [requestId,setRequestId]=useState<string|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);

  useEffect(()=>{let active=true;(async()=>{const [{data:groupRows},{data:assignment}]=await Promise.all([supabase.rpc("fn_list_groups"),supabase.from("gm_station_assignments").select("station_id").eq("user_id",profile.id).eq("day",2).maybeSingle()]);if(!active)return;setGroups((groupRows as GroupOption[])??[]);if(assignment?.station_id){const {data}=await supabase.from("stations").select("id,code,name,difficulty,token_cost,location_exclusion_limit,is_active").eq("id",assignment.station_id).maybeSingle();if(active)setStation((data as Day2Station|null)??null)}if(active)setLoading(false)})();return()=>{active=false}},[profile.id,supabase]);

  function prepare(){setError(null);const id=Number(groupValue.trim());if(!Number.isInteger(id)||id<1)return setError("Enter a valid group number.");if(!groups.some(group=>group.id===id))return setError(`Group ${id} does not exist.`);if(!station)return setError("Your Day 2 station has not been assigned yet.");if(!station.is_active)return setError("Your assigned Day 2 station is inactive.");setPendingGroup(id);setRequestId(crypto.randomUUID())}
  async function start(){if(!pendingGroup||!requestId)return;setBusy(true);setError(null);const {data,error:rpcError}=await supabase.rpc("fn_start_day2_attempt",{p_group_id:pendingGroup,p_request_id:requestId});setBusy(false);if(rpcError)return setError(friendlyError(rpcError));const attemptId=(data as {attempt_id:string}).attempt_id;router.push(`/gm/day-2/attempt/${attemptId}`)}

  if(loading)return <LoadingState label="Loading Day 2 station"/>;
  return <div className="space-y-4"><PageHeader title="Day 2" subtitle={station?`${station.code} · ${station.name}`:"No Day 2 station assigned"}/><ErrorBanner message={error}/>
    {!station&&<div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-black">Station assignment required</p><p className="mt-1">Ask an Admin to assign this GM account to a Day 2 station.</p></div>}
    {station&&<SectionCard title="Station configuration" description="Values are controlled by Admin and captured when an attempt starts."><div className="grid grid-cols-3 gap-2"><div className="rounded-xl bg-paper-100 p-3 text-center"><ShieldCheck className="mx-auto text-brand-1" size={20}/><p className="mt-1 text-xs text-ink-faint">Difficulty</p><p className="font-black">{station.difficulty}</p></div><div className="rounded-xl bg-paper-100 p-3 text-center"><Coins className="mx-auto text-amber-600" size={20}/><p className="mt-1 text-xs text-ink-faint">Entry</p><p className="font-black">{station.token_cost}</p></div><div className="rounded-xl bg-paper-100 p-3 text-center"><MapPin className="mx-auto text-brand-2" size={20}/><p className="mt-1 text-xs text-ink-faint">Exclusions</p><p className="font-black">{station.location_exclusion_limit}</p></div></div></SectionCard>}
    <SectionCard title="Group" description="Enter the group that is starting this station attempt."><div className="flex items-center gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-1/10 text-brand-1"><Users size={23}/></span><InputBox id="day2-group" aria-label="Group number" inputMode="numeric" placeholder="Group number" value={groupValue} onChange={event=>setGroupValue(event.target.value)} className="min-h-[56px] text-lg font-black"/></div>{station&&<div className="mt-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"><span className="text-sm font-bold text-amber-900">Configured entry cost</span><span className="text-xl font-black text-amber-800">-{station.token_cost} tokens</span></div>}</SectionCard>
    <button type="button" disabled={!station||busy} onClick={prepare} className="btn min-h-[64px] w-full bg-green-600 text-lg font-black text-white shadow-card hover:bg-green-700 disabled:opacity-50">Deduct and start attempt</button>
    {pendingGroup&&station&&<div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-3 backdrop-blur-sm sm:items-center"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.16em] text-brand-1">{station.code}</p><h2 className="text-2xl font-black">Confirm station entry</h2></div><StatusBadge tone="warning">{station.difficulty}</StatusBadge></div><div className="mt-5 rounded-2xl border border-paper-200 p-4"><p className="text-sm text-ink-faint">Group</p><p className="text-xl font-black">{groups.find(group=>group.id===pendingGroup)?.name??`Group ${pendingGroup}`}</p><div className="mt-3 flex justify-between border-t border-paper-200 pt-3"><span className="font-bold">Token deduction</span><span className="text-xl font-black text-red-600">-{station.token_cost}</span></div></div><p className="mt-4 text-sm text-ink-faint">Payment and attempt creation happen together. If payment fails, no attempt will be created.</p><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" disabled={busy} className="btn-secondary min-h-[52px]" onClick={()=>{setPendingGroup(null);setRequestId(null)}}>Back</button><button type="button" disabled={busy} className="btn min-h-[52px] bg-green-600 font-black text-white disabled:opacity-50" onClick={start}>{busy?"Processing…":"Confirm deduction"}</button></div></div></div>}
  </div>
}
