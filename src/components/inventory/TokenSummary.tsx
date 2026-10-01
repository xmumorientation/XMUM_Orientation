"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";

interface Summary { group_id:number;group_name:string;token_balance:number }

export function TokenSummary({onGroupLoaded}:{onGroupLoaded?:(summary:Summary)=>void}){
  const supabase=useMemo(()=>supabaseBrowser(),[]),[summary,setSummary]=useState<Summary|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{setLoading(true);setError(null);const {data,error:e}=await supabase.rpc("fn_my_inventory_group");if(e)setError(friendlyError(e));else{const row=(data as Summary[]|null)?.[0]??null;setSummary(row);if(row)onGroupLoaded?.(row)}setLoading(false)},[onGroupLoaded,supabase]);
  useEffect(()=>{void load()},[load]);
  const groupId=summary?.group_id;
  useEffect(()=>{if(!groupId)return;const channel=supabase.channel(`inventory-token-${groupId}`).on("postgres_changes",{event:"UPDATE",schema:"public",table:"groups",filter:`id=eq.${groupId}`},()=>void load()).subscribe();return()=>{void supabase.removeChannel(channel)}},[groupId,load,supabase]);
  return <Card className="min-h-[104px] p-4"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase text-ink-faint">Group tokens</p>{loading?<Spinner/>:error?<><p className="mt-2 text-sm font-semibold text-red-700">{error}</p><button className="btn-secondary mt-2" onClick={()=>void load()}>Retry Token</button></>:<p className="text-3xl font-black tabular-nums">{summary?.token_balance??0}</p>}</div><span className="chip bg-amber-100 text-amber-800">TOKEN</span></div></Card>;
}
