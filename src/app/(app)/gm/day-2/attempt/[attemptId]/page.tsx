"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ErrorBanner, SuccessBanner } from "@/components/ui";
import { LoadingState, PageHeader, SectionCard, StatusBadge } from "@/components/ui/Shared";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PROJECTOR_LABELS, PROJECTOR_LOCATIONS, type ProjectorLocation } from "@/lib/types";
import { friendlyError } from "@/lib/utils";

interface Attempt {
  attempt_id:string; group_id:number; station_id:number; difficulty:string; entry_cost:number;
  exclusion_limit:number; payment_status:string; status:string; started_at:string;
  result:"WIN"|"LOSE"|null; reward_puzzle_id:string|null; excluded_locations:ProjectorLocation[];
}

export default function Day2AttemptPage(){
  const params=useParams<{attemptId:string}>(),router=useRouter(),supabase=useMemo(()=>supabaseBrowser(),[]);
  const [attempt,setAttempt]=useState<Attempt|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
  const [result,setResult]=useState<"WIN"|"LOSE"|null>(null),[excluded,setExcluded]=useState<ProjectorLocation[]>([]),[reward,setReward]=useState<string|null>(null);

  const load=useCallback(async()=>{
    const {data,error:loadError}=await supabase.from("game_attempts")
      .select("attempt_id,group_id,station_id,difficulty,entry_cost,exclusion_limit,payment_status,status,started_at,result,reward_puzzle_id,excluded_locations")
      .eq("attempt_id",params.attemptId).maybeSingle();
    if(loadError||!data)setError(loadError?.message??"Attempt not found.");else{
      const row=data as Attempt;setAttempt(row);setResult(row.result);setExcluded(row.excluded_locations??[]);
      if(row.status==="REWARD_GENERATED"&&row.reward_puzzle_id)setReward(row.reward_puzzle_id);
    }setLoading(false);
  },[params.attemptId,supabase]);
  useEffect(()=>{void load()},[load]);

  function toggleLocation(location:ProjectorLocation){
    setError(null);
    if(excluded.includes(location)){setExcluded(v=>v.filter(x=>x!==location));return}
    if(!attempt||excluded.length>=attempt.exclusion_limit){setError(`You may only exclude ${attempt?.exclusion_limit??0} location(s) at this station.`);return}
    setExcluded(v=>[...v,location]);
  }
  function clear(){setResult(null);setExcluded([]);setError(null);setNotice("Selections cleared. The earlier Token payment was not changed.")}
  async function submit(){
    if(!attempt||!result){setError("Please select a result.");return}
    if(!window.confirm(`Submit ${result} for Group ${attempt.group_id}?`))return;
    setBusy(true);setError(null);setNotice(null);
    const {data,error:e}=await supabase.rpc("fn_submit_day2_result",{p_attempt_id:attempt.attempt_id,p_result:result,p_excluded_locations:excluded,p_request_id:crypto.randomUUID()});
    setBusy(false);if(e){setError(friendlyError(e));return}
    const response=data as {status:string;reward_puzzle_id?:string;no_reward?:boolean};
    if(response.status==="REWARD_GENERATED"&&response.reward_puzzle_id){setReward(response.reward_puzzle_id);await load();return}
    if(response.no_reward){setNotice("Win recorded, but the configured exhaustion policy produced no Puzzle reward.");await load();return}
    router.push("/gm/day-2?result=lose");router.refresh();
  }
  async function commitReward(){
    if(!attempt||!reward)return;setBusy(true);setError(null);
    const {error:e}=await supabase.rpc("fn_commit_day2_puzzle_reward",{p_attempt_id:attempt.attempt_id,p_request_id:crypto.randomUUID()});
    setBusy(false);if(e){setError(friendlyError(e));return}
    setReward(null);router.push(`/gm/day-2?reward=${encodeURIComponent(reward)}&group=${attempt.group_id}`);router.refresh();
  }

  if(loading)return <LoadingState label="Loading Day 2 attempt"/>;
  const locked=attempt?.status==="COMPLETED";
  return <div className="space-y-4">
    <PageHeader title="Day 2" subtitle={attempt?`Group ${attempt.group_id} · Station ${attempt.station_id}`:"Attempt unavailable"}/>
    <ErrorBanner message={error}/><SuccessBanner message={notice}/>
    {attempt&&<>
      <SectionCard title="Active challenge" description={`Started ${new Date(attempt.started_at).toLocaleString()}`}><div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-paper-100 p-3"><p className="text-ink-faint">Group</p><p className="text-xl font-black">{attempt.group_id}</p></div><div className="rounded-xl bg-paper-100 p-3"><p className="text-ink-faint">Difficulty</p><p className="font-black">{attempt.difficulty}</p></div><div className="rounded-xl bg-paper-100 p-3"><p className="text-ink-faint">Payment</p><StatusBadge tone="success">{attempt.entry_cost} TOKENS PAID</StatusBadge></div><div className="rounded-xl bg-paper-100 p-3"><p className="text-ink-faint">Status</p><p className="font-black">{attempt.status}</p></div></div></SectionCard>
      {!locked&&<SectionCard title="Locked area" description={`Choose up to ${attempt.exclusion_limit} unwanted location(s). This uses the station configuration, not the difficulty label.`}><div className="grid gap-3 sm:grid-cols-3">{PROJECTOR_LOCATIONS.map(location=>{const selected=excluded.includes(location);return <button key={location} type="button" disabled={busy||attempt.exclusion_limit===0} onClick={()=>toggleLocation(location)} className={`min-h-[88px] rounded-2xl border-2 p-4 text-left transition ${selected?"border-red-500 bg-red-50 text-red-900":"border-paper-200 bg-white text-ink"}`}><span className="block text-lg font-black">{location}</span><span className="text-xs">{PROJECTOR_LABELS[location]}</span><span className="mt-2 block text-xs font-bold">{selected?"EXCLUDED":"AVAILABLE"}</span></button>})}</div>{attempt.exclusion_limit===0&&<p className="mt-3 text-sm text-ink-faint">This station cannot exclude a location.</p>}</SectionCard>}
      {!locked&&<SectionCard title="Result" description="A Win reserves one new eligible Puzzle. A Lose awards none."><div className="grid grid-cols-2 gap-3"><button type="button" disabled={busy} onClick={()=>setResult("WIN")} className={`min-h-[76px] rounded-2xl border-2 text-xl font-black ${result==="WIN"?"border-green-600 bg-green-600 text-white":"border-green-200 bg-green-50 text-green-800"}`}>WIN</button><button type="button" disabled={busy} onClick={()=>setResult("LOSE")} className={`min-h-[76px] rounded-2xl border-2 text-xl font-black ${result==="LOSE"?"border-red-600 bg-red-600 text-white":"border-red-200 bg-red-50 text-red-800"}`}>LOSE</button></div><button type="button" disabled={busy} onClick={clear} className="mt-3 min-h-[52px] w-full rounded-xl bg-red-600 font-black text-white disabled:opacity-50">CLEAR</button><button type="button" disabled={busy||!result} onClick={()=>void submit()} className="mt-3 min-h-[58px] w-full rounded-xl bg-green-600 text-lg font-black text-white disabled:opacity-50">{busy?"SUBMITTING…":"SUBMIT"}</button></SectionCard>}
      {locked&&<SectionCard title="Attempt completed" description="This result has already been committed."><p className="text-lg font-black">{attempt.result}</p>{attempt.reward_puzzle_id&&<p className="mt-2 text-sm">Puzzle: <strong>{attempt.reward_puzzle_id}</strong></p>}</SectionCard>}
    </>}
    <Link href="/gm/day-2" className="btn-secondary flex min-h-[52px] w-full items-center justify-center">Back to Day 2 entry</Link>
    {reward&&attempt&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"><div role="dialog" aria-modal="true" className="card w-full max-w-sm space-y-5 p-6 text-center"><div><p className="text-lg font-bold">Group {attempt.group_id} received</p><p className="mt-5 text-5xl font-black text-brand-1">{reward}</p></div><p className="text-sm text-ink-faint">The piece is reserved for this attempt. Confirm to update the group inventory.</p><button type="button" disabled={busy} onClick={()=>void commitReward()} className="min-h-[58px] w-full rounded-xl bg-green-600 font-black text-white disabled:opacity-50">{busy?"UPDATING…":"UPDATE IN GROUP"}</button></div></div>}
  </div>;
}
