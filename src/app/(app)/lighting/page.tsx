"use client";

import { Lightbulb, Radio } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WebNFCReader } from "@/components/nfc/WebNFCReader";
import { useToast } from "@/components/ToastProvider";
import { Card, ErrorBanner, PageTitle, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ProjectorLocation } from "@/lib/types";
import { friendlyError, idemKey } from "@/lib/utils";

interface Zone {location:ProjectorLocation;name:string;activated_by_group:number|null;activated_group_name:string|null;activated_at:string|null}

export default function LightingPage(){
  const supabase=useMemo(()=>supabaseBrowser(),[]),toast=useToast();
  const [zones,setZones]=useState<Zone[]>([]),[loading,setLoading]=useState(true),[scanner,setScanner]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[flash,setFlash]=useState<ProjectorLocation|null>(null);
  const load=useCallback(async()=>{const {data,error:e}=await supabase.rpc("fn_lighting_zones");if(e)setError(friendlyError(e));else setZones((data as Zone[])??[]);setLoading(false)},[supabase]);
  useEffect(()=>{void load();const channel=supabase.channel("lighting-zones").on("postgres_changes",{event:"UPDATE",schema:"public",table:"projectors"},payload=>{void load();const loc=(payload.new as {location?:ProjectorLocation}).location;if(loc){setFlash(loc);window.setTimeout(()=>setFlash(null),2400)}}).subscribe();return()=>{void supabase.removeChannel(channel)}},[load,supabase]);
  async function redeem(token:string){setScanner(false);setBusy(true);setError(null);try{const response=await fetch("/api/nfc/redeem",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,requestId:idemKey()})}),data=await response.json();if(!response.ok)throw new Error(data.error??"NFC redemption failed.");const location=data.location as ProjectorLocation;setFlash(location);toast({message:`Zone ${location} activated successfully.`,tone:"success",durationMs:6000});await load()}catch(e){setError(friendlyError(e))}finally{setBusy(false)}}
  return <div className="space-y-4"><PageTitle title="Lighting Zone" subtitle="Activate a Zone with a verified single-use NFC card"/><ErrorBanner message={error}/>{loading?<div className="flex justify-center py-16"><Spinner/></div>:<div className="space-y-3">{zones.map((zone,index)=><Card key={zone.location} className={`relative overflow-hidden border-2 p-6 text-center transition-all duration-700 ${zone.activated_at?"border-amber-400 bg-gradient-to-br from-amber-50 to-yellow-100":"border-paper-200 bg-white"} ${flash===zone.location?"scale-[1.02] shadow-[0_0_40px_rgba(251,191,36,.65)]":""}`}><Lightbulb className={`mx-auto h-12 w-12 ${zone.activated_at?"animate-pulse text-amber-500":"text-ink-faint"}`}/><p className="mt-2 text-xs font-black uppercase tracking-[.18em] text-ink-faint">Zone {index+1}</p><h2 className="text-xl font-black">{zone.name}</h2>{zone.activated_at?<><p className="mt-3 font-black text-amber-700">ACTIVATED</p><p className="text-sm">{zone.activated_group_name??`Group ${zone.activated_by_group}`}</p></>:<p className="mt-3 font-bold text-ink-faint">NOT ACTIVATED</p>}</Card>)}</div>}<button disabled={busy} onClick={()=>setScanner(true)} className="btn-primary min-h-[60px] w-full text-lg"><Radio size={22}/>{busy?"Validating…":"NFC SCAN"}</button><WebNFCReader open={scanner} onToken={token=>void redeem(token)} onClose={()=>setScanner(false)}/></div>;
}
