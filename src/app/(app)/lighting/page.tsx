"use client";

import { Lightbulb, Radio } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ZoneActivationEffect, type LightingEffectStyle } from "@/components/lighting/ZoneActivationEffect";
import { WebNFCReader } from "@/components/nfc/WebNFCReader";
import { useCurrentUserContext } from "@/components/ProfileProvider";
import { useToast } from "@/components/ToastProvider";
import { useConfig } from "@/components/useConfig";
import { Card, ErrorBanner, PageTitle, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ProjectorLocation } from "@/lib/types";
import { friendlyError, idemKey } from "@/lib/utils";

interface Zone {location:ProjectorLocation;name:string;activated_by_group:number|null;activated_group_name:string|null;activated_by_nfc_id:number|null;activated_at:string|null;updated_at:string}
type EffectScope="SCANNING_DEVICE"|"ALL_VIEWERS"|"NONE";

function textSetting(value:unknown,fallback:string){return typeof value==="string"?value:fallback}
function numberSetting(value:unknown,fallback:number){const number=Number(value);return Number.isFinite(number)?number:fallback}

export default function LightingPage(){
  const supabase=useMemo(()=>supabaseBrowser(),[]),toast=useToast(),currentUser=useCurrentUserContext(),{config}=useConfig();
  const [zones,setZones]=useState<Zone[]>([]),[loading,setLoading]=useState(true),[scanner,setScanner]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const [effectLocation,setEffectLocation]=useState<ProjectorLocation|null>(null),effectTimer=useRef<number|null>(null);
  const scope=textSetting(config.lighting_effect_scope,"ALL_VIEWERS") as EffectScope,style=textSetting(config.lighting_effect_style,"GLOW") as LightingEffectStyle,duration=Math.min(10000,Math.max(0,numberSetting(config.lighting_effect_duration_ms,2400)));
  const canScan=currentUser.permissions.includes("nfc.scan");
  const load=useCallback(async()=>{const {data,error:e}=await supabase.rpc("fn_lighting_zones");if(e)setError(friendlyError(e));else setZones((data as Zone[])??[]);setLoading(false)},[supabase]);
  const playEffect=useCallback((location:ProjectorLocation)=>{if(style==="NONE"||scope==="NONE"||duration===0)return;if(effectTimer.current)window.clearTimeout(effectTimer.current);setEffectLocation(location);effectTimer.current=window.setTimeout(()=>setEffectLocation(null),duration)},[duration,scope,style]);
  useEffect(()=>()=>{if(effectTimer.current)window.clearTimeout(effectTimer.current)},[]);
  useEffect(()=>{void load();const channel=supabase.channel("lighting-zones").on("postgres_changes",{event:"UPDATE",schema:"public",table:"projectors"},payload=>{void load();const next=payload.new as {location?:ProjectorLocation;activated_at?:string|null};if(scope==="ALL_VIEWERS"&&next.location&&next.activated_at)playEffect(next.location)}).subscribe();return()=>{void supabase.removeChannel(channel)}},[load,playEffect,scope,supabase]);
  async function redeem(token:string){setScanner(false);setBusy(true);setError(null);try{const response=await fetch("/api/nfc/redeem",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,requestId:idemKey()})}),data=await response.json();if(!response.ok)throw new Error(data.error??"NFC redemption failed.");const location=data.location as ProjectorLocation;if(scope!=="NONE")playEffect(location);toast({message:`Zone ${location} activated successfully.`,tone:"success",durationMs:6000});await load()}catch(e){setError(friendlyError(e))}finally{setBusy(false)}}
  const effectZone=zones.find(zone=>zone.location===effectLocation);
  return <div className="space-y-4"><PageTitle title="Lighting Zone" subtitle="Shared current-orientation Zone ownership"/><ErrorBanner message={error}/>{loading?<div className="flex justify-center py-16"><Spinner/></div>:<div className="space-y-3">{zones.map((zone,index)=><Card key={zone.location} className={`relative overflow-hidden border-2 p-6 text-center transition-all duration-700 ${zone.activated_at?"border-amber-400 bg-gradient-to-br from-amber-50 to-yellow-100":"border-paper-200 bg-white"}`}><Lightbulb className={`mx-auto h-12 w-12 ${zone.activated_at?"text-amber-500":"text-ink-faint"}`}/><p className="mt-2 text-xs font-black uppercase tracking-[.18em] text-ink-faint">Zone {index+1}</p><h2 className="text-xl font-black">{zone.name}</h2>{zone.activated_at?<><p className="mt-3 font-black text-amber-700">ACTIVATED</p><p className="text-sm font-bold">{zone.activated_group_name??`Group ${zone.activated_by_group}`}</p><p className="mt-1 text-xs text-ink-faint">{new Date(zone.activated_at).toLocaleString()}</p></>:<p className="mt-3 font-bold text-ink-faint">NOT ACTIVATED</p>}</Card>)}</div>}{canScan&&<button disabled={busy} onClick={()=>setScanner(true)} className="btn-primary min-h-[60px] w-full text-lg"><Radio size={22}/>{busy?"Validating…":"NFC SCAN"}</button>}{canScan&&<WebNFCReader open={scanner} onToken={token=>void redeem(token)} onClose={()=>setScanner(false)}/>} {effectLocation&&effectZone&&<ZoneActivationEffect location={effectLocation} zoneLabel={effectZone.name} groupName={effectZone.activated_group_name??(effectZone.activated_by_group?`Group ${effectZone.activated_by_group}`:null)} style={style}/>}</div>;
}
