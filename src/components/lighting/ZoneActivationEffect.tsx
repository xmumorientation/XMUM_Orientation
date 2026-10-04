"use client";

import { Lightbulb, Sparkles } from "lucide-react";
import type { ProjectorLocation } from "@/lib/types";

export type LightingEffectStyle="GLOW"|"PULSE"|"NONE";

export function ZoneActivationEffect({location,zoneLabel,groupName,style}:{location:ProjectorLocation;zoneLabel:string;groupName:string|null;style:LightingEffectStyle}){
  if(style==="NONE")return null;
  return <div className="pointer-events-none fixed inset-0 z-[85] flex items-center justify-center overflow-hidden bg-night-900/70 p-5" role="status" aria-live="polite">
    <div className={`absolute h-80 w-80 rounded-full bg-amber-300/40 blur-3xl motion-reduce:animate-none ${style==="PULSE"?"animate-ping":"animate-pulse"}`}/>
    <div className="relative w-full max-w-sm rounded-[2rem] border border-amber-200/60 bg-gradient-to-br from-amber-300 via-yellow-100 to-white p-8 text-center shadow-[0_0_80px_rgba(251,191,36,.7)]">
      <Sparkles className="absolute right-6 top-6 text-amber-600 motion-safe:animate-pulse"/>
      <Lightbulb className="mx-auto h-20 w-20 text-amber-600 motion-safe:animate-bounce"/>
      <p className="mt-4 text-xs font-black uppercase tracking-[.2em] text-amber-800">{location} · {zoneLabel}</p>
      <p className="mt-2 text-3xl font-black text-ink">ZONE ACTIVATED</p>
      {groupName&&<p className="mt-2 text-lg font-bold text-amber-900">{groupName}</p>}
    </div>
  </div>;
}
