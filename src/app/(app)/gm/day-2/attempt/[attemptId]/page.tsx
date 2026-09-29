"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ErrorBanner } from "@/components/ui";
import { LoadingState, ModulePlaceholder, PageHeader, SectionCard, StatusBadge } from "@/components/ui/Shared";
import { supabaseBrowser } from "@/lib/supabase/client";

interface Attempt { attempt_id:string;group_id:number;station_id:number;difficulty:string;entry_cost:number;exclusion_limit:number;payment_status:string;status:string;started_at:string }

export default function Day2AttemptPage(){const params=useParams<{attemptId:string}>();const supabase=useMemo(()=>supabaseBrowser(),[]);const [attempt,setAttempt]=useState<Attempt|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null);
 useEffect(()=>{let active=true;(async()=>{const {data,error:loadError}=await supabase.from("game_attempts").select("attempt_id,group_id,station_id,difficulty,entry_cost,exclusion_limit,payment_status,status,started_at").eq("attempt_id",params.attemptId).maybeSingle();if(!active)return;if(loadError||!data)setError(loadError?.message??"Attempt not found.");else setAttempt(data as Attempt);setLoading(false)})();return()=>{active=false}},[params.attemptId,supabase]);
 if(loading)return <LoadingState label="Loading Day 2 attempt"/>;
 return <div className="space-y-4"><PageHeader title="Day 2 attempt" subtitle={attempt?`Group ${attempt.group_id} · Station ${attempt.station_id}`:"Attempt unavailable"}/><ErrorBanner message={error}/>{attempt&&<><SectionCard title="Entry confirmed" description={`Started ${new Date(attempt.started_at).toLocaleString()}`}><div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-paper-100 p-3"><p className="text-ink-faint">Payment</p><StatusBadge tone="success">{attempt.payment_status}</StatusBadge></div><div className="rounded-xl bg-paper-100 p-3"><p className="text-ink-faint">Status</p><p className="font-black">{attempt.status}</p></div><div className="rounded-xl bg-paper-100 p-3"><p className="text-ink-faint">Difficulty</p><p className="font-black">{attempt.difficulty}</p></div><div className="rounded-xl bg-paper-100 p-3"><p className="text-ink-faint">Paid</p><p className="font-black">{attempt.entry_cost} tokens</p></div></div></SectionCard><ModulePlaceholder title="Day 2 result" message="Result and puzzle reward workflow pending"/></>}<Link href="/gm/day-2" className="btn-secondary flex min-h-[52px] w-full items-center justify-center">Back to Day 2 entry</Link></div>}
