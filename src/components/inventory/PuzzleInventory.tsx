"use client";

import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PuzzleBoard } from "@/components/PuzzleBoard";
import { useConfig, puzzleImageUrl } from "@/components/useConfig";
import { Card, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PIECES_PER_SET, PROJECTOR_LABELS, PROJECTOR_LOCATIONS, type ProjectorLocation } from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

interface PuzzleRow { inventory_id:number;status:"COLLECTED"|"REDEEMED";puzzle_location:ProjectorLocation;puzzle_index:number;display_asset:string|null }

export function PuzzleInventory({groupId,groupName}:{groupId:number;groupName?:string}){
  const supabase=useMemo(()=>supabaseBrowser(),[]),{config}=useConfig(),[rows,setRows]=useState<PuzzleRow[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{setLoading(true);setError(null);const {data,error:e}=await supabase.rpc("fn_my_puzzle_inventory");if(e)setError(friendlyError(e));else setRows((data as PuzzleRow[])??[]);setLoading(false)},[supabase]);
  useEffect(()=>{void load();const recover=()=>void load();window.addEventListener("orientation:reconnect",recover);const channel=supabase.channel(`inventory-puzzles-${groupId}`).on("postgres_changes",{event:"*",schema:"public",table:"inventory",filter:`group_id=eq.${groupId}`},()=>void load()).subscribe();return()=>{window.removeEventListener("orientation:reconnect",recover);void supabase.removeChannel(channel)}},[groupId,load,supabase]);
  if(loading)return <Card className="flex min-h-[180px] items-center justify-center"><Spinner/></Card>;
  if(error)return <Card><h2 className="font-semibold">Puzzle</h2><p className="mt-3 text-sm font-semibold text-red-700">{error}</p><button className="btn-secondary mt-3 w-full" onClick={()=>void load()}>Retry Puzzle</button></Card>;
  return <section className="space-y-3" aria-label="Puzzle inventory"><div className="px-1"><h2 className="text-sm font-black uppercase tracking-[.14em] text-ink-soft">Puzzle</h2></div>{PROJECTOR_LOCATIONS.map(loc=>{const locationRows=rows.filter(row=>row.puzzle_location===loc),owned=locationRows.map(row=>row.puzzle_index).sort((a,b)=>a-b),pieceImages=Object.fromEntries(locationRows.filter(row=>row.display_asset).map(row=>[row.puzzle_index,row.display_asset as string])),complete=owned.length>=PIECES_PER_SET;return <Card key={loc}><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">{PROJECTOR_LABELS[loc]} Blueprint</h3><span className={cn("chip",complete?"bg-green-100 text-green-800":"bg-paper-200 text-ink-soft")}>{owned.length}/{PIECES_PER_SET} pieces</span></div><PuzzleBoard ownedIndices={owned} imageUrl={puzzleImageUrl(config,loc)} pieceImages={pieceImages} complete={complete} groupName={groupName}/>{complete&&<p className="mt-2 flex items-center justify-center gap-1.5 text-center text-sm font-semibold text-amber-500"><Sparkles size={16}/>Set complete! Bring your group to the Guardian at {PROJECTOR_LABELS[loc]} to verify.</p>}</Card>})}</section>;
}
