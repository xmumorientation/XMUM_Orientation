"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PuzzleBoard } from "@/components/PuzzleBoard";
import { Card, EmptyState, ErrorBanner, PageTitle, Spinner, SuccessBanner } from "@/components/ui";
import { puzzleImageUrl, useConfig } from "@/components/useConfig";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PROJECTOR_LABELS, PROJECTOR_LOCATIONS, type ProjectorLocation } from "@/lib/types";
import { friendlyError } from "@/lib/utils";

type Puzzle = { id:number; puzzle_code:string; puzzle_location:ProjectorLocation; puzzle_index:number; is_active:boolean; version:number };
type Ownership = { id:number; group_id:number; status:"COLLECTED"|"REDEEMED"; obtained_station_id:number|null; obtained_attempt_id:string|null; created_at:string; redeemed_at:string|null; items:Puzzle|null };
type Filters = { group:string; code:string; location:string; station:string; status:string; date:string };
const EMPTY_FILTERS: Filters = { group:"", code:"", location:"ALL", station:"", status:"ALL", date:"" };

export default function AdminPuzzlesPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { config } = useConfig();
  const [puzzles,setPuzzles]=useState<Puzzle[]>([]),[ownership,setOwnership]=useState<Ownership[]>([]);
  const [filters,setFilters]=useState<Filters>(EMPTY_FILTERS),[policy,setPolicy]=useState("STOP"),[policyVersion,setPolicyVersion]=useState(1);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);

  const load=useCallback(async()=>{
    setError(null);
    const [a,b,c]=await Promise.all([
      supabase.from("items").select("id,puzzle_code,puzzle_location,puzzle_index,is_active,version").eq("type","puzzle").order("puzzle_location").order("puzzle_index"),
      supabase.from("inventory").select("id,group_id,status,obtained_station_id,obtained_attempt_id,created_at,redeemed_at,items!inner(id,puzzle_code,puzzle_location,puzzle_index,is_active,version)").eq("item_type","puzzle").order("created_at",{ascending:false}),
      supabase.from("game_config").select("value,version").eq("key","puzzle_pool_exhaustion_policy").maybeSingle(),
    ]);
    if(a.error||b.error){setError(friendlyError(a.error||b.error));setLoading(false);return;}
    setPuzzles((a.data??[]) as Puzzle[]);setOwnership((b.data??[]) as unknown as Ownership[]);
    if(c.data){setPolicy(String(c.data.value).replaceAll('"','').toUpperCase());setPolicyVersion(c.data.version)}
    setLoading(false);
  },[supabase]);
  useEffect(()=>{void load()},[load]);

  function patchPuzzle(id:number,patch:Partial<Puzzle>){setPuzzles(v=>v.map(p=>p.id===id?{...p,...patch}:p))}
  async function savePuzzle(p:Puzzle){
    const reason=window.prompt("Reason for this Puzzle configuration change:");if(!reason)return;
    setBusy(`p-${p.id}`);setError(null);
    const {error:e}=await supabase.rpc("fn_admin_update_puzzle",{p_puzzle_id:p.id,p_code:p.puzzle_code,p_location:p.puzzle_location,p_is_active:p.is_active,p_expected_version:p.version,p_reason:reason});
    setBusy(null);if(e)setError(friendlyError(e));else{setNotice("Puzzle configuration updated successfully.");await load()}
  }
  async function savePolicy(){
    setBusy("policy");setError(null);
    const {error:e}=await supabase.rpc("fn_admin_set_game_setting",{p_key:"puzzle_pool_exhaustion_policy",p_value:policy,p_expected_version:policyVersion,p_reason:"Puzzle configuration page"});
    setBusy(null);if(e)setError(friendlyError(e));else{setNotice("Puzzle exhaustion policy updated.");await load()}
  }
  async function upload(loc:ProjectorLocation,file:File){
    setBusy(`image-${loc}`);setError(null);const path=`${loc}-${Date.now()}.${file.name.split(".").pop()||"jpg"}`;
    const {error:upErr}=await supabase.storage.from("puzzle-images").upload(path,file,{upsert:true,cacheControl:"3600"});
    if(upErr){setError(upErr.message);setBusy(null);return}const {data}=supabase.storage.from("puzzle-images").getPublicUrl(path);
    const {error:e}=await supabase.rpc("fn_set_config",{p_key:`puzzle_image_${loc}`,p_value:data.publicUrl});setBusy(null);
    if(e)setError(friendlyError(e));else setNotice(`${PROJECTOR_LABELS[loc]} picture updated.`);
  }
  async function correct(row:Ownership){
    const groupRaw=window.prompt("Correct group ID:",String(row.group_id));if(!groupRaw)return;
    const code=window.prompt("Correct Puzzle code:",row.items?.puzzle_code??"");if(!code)return;
    const target=puzzles.find(p=>p.puzzle_code.toUpperCase()===code.trim().toUpperCase());if(!target){setError("Puzzle code not found.");return}
    const status=window.prompt("Status (COLLECTED or REDEEMED):",row.status)?.toUpperCase();if(status!=="COLLECTED"&&status!=="REDEEMED")return;
    const reason=window.prompt("Correction reason:");if(!reason)return;
    const args={p_inventory_id:row.id,p_new_group_id:Number(groupRaw),p_new_puzzle_id:target.id,p_new_status:status,p_reason:reason,p_confirm_dependency:false};
    setBusy(`o-${row.id}`);let {error:e}=await supabase.rpc("fn_admin_correct_puzzle_ownership",args);
    if(e?.message.includes("PUZZLE_REDEMPTION_DEPENDENCY")&&window.confirm("This Puzzle has an NFC/redemption dependency. Apply the correction anyway?"))({error:e}=await supabase.rpc("fn_admin_correct_puzzle_ownership",{...args,p_confirm_dependency:true}));
    setBusy(null);if(e)setError(friendlyError(e));else{setNotice("Puzzle ownership corrected and history preserved.");await load()}
  }

  const results=ownership.filter(r=>(!filters.group||String(r.group_id)===filters.group)&&(!filters.code||(r.items?.puzzle_code??"").toLowerCase().includes(filters.code.toLowerCase()))&&(filters.location==="ALL"||r.items?.puzzle_location===filters.location)&&(!filters.station||String(r.obtained_station_id??"")===filters.station)&&(filters.status==="ALL"||r.status===filters.status)&&(!filters.date||r.created_at.startsWith(filters.date)));
  if(loading)return <div className="flex justify-center py-12"><Spinner/></div>;
  return <div className="space-y-4">
    <PageTitle title="Puzzle configuration" subtitle="Manage the current orientation Puzzle pool and ownership history"/><ErrorBanner message={error}/><SuccessBanner message={notice}/>
    <Card className="space-y-3"><h2 className="font-semibold">POOL EXHAUSTION</h2><p className="text-sm text-ink-faint">STOP prevents duplicate rewards. REUSE is stored for future workflows but never bypasses a group&apos;s permanent no-duplicate history.</p><select className="input" value={policy} onChange={e=>setPolicy(e.target.value)}><option value="STOP">Stop when no new Puzzle remains</option><option value="REUSE">Reuse according to reward workflow</option></select><button className="btn-primary w-full" disabled={busy==="policy"} onClick={savePolicy}>{busy==="policy"?"Saving…":"Save policy"}</button></Card>
    {PROJECTOR_LOCATIONS.map(loc=><Card key={loc} className="space-y-3"><div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{PROJECTOR_LABELS[loc]}</h2><label className="btn-secondary cursor-pointer text-sm">{busy===`image-${loc}`?"Uploading…":"Upload image"}<input type="file" accept="image/*" className="hidden" disabled={busy!==null} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(loc,f);e.target.value=""}}/></label></div>
      {puzzleImageUrl(config,loc)&&<PuzzleBoard ownedIndices={[1,3,4]} imageUrl={puzzleImageUrl(config,loc)} complete={false}/>}<div className="space-y-2">{puzzles.filter(p=>p.puzzle_location===loc).map(p=><div key={p.id} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl border border-paper-200 p-3"><div><label className="text-xs text-ink-faint">Piece {p.puzzle_index}</label><input className="input mt-1" value={p.puzzle_code} onChange={e=>patchPuzzle(p.id,{puzzle_code:e.target.value})}/><select className="input mt-2" value={p.puzzle_location} onChange={e=>patchPuzzle(p.id,{puzzle_location:e.target.value as ProjectorLocation})}>{PROJECTOR_LOCATIONS.map(x=><option key={x}>{x}</option>)}</select><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={p.is_active} onChange={e=>patchPuzzle(p.id,{is_active:e.target.checked})}/> Active in reward pool</label></div><button className="btn-secondary" disabled={busy===`p-${p.id}`} onClick={()=>void savePuzzle(p)}>Save</button></div>)}</div></Card>)}
    <Card className="space-y-3"><h2 className="font-semibold">PUZZLE LOG</h2><div className="grid grid-cols-2 gap-2"><input className="input" inputMode="numeric" placeholder="Group ID" value={filters.group} onChange={e=>setFilters({...filters,group:e.target.value})}/><input className="input" placeholder="Puzzle code" value={filters.code} onChange={e=>setFilters({...filters,code:e.target.value})}/><select className="input" value={filters.location} onChange={e=>setFilters({...filters,location:e.target.value})}><option>ALL</option>{PROJECTOR_LOCATIONS.map(x=><option key={x}>{x}</option>)}</select><input className="input" inputMode="numeric" placeholder="Station ID" value={filters.station} onChange={e=>setFilters({...filters,station:e.target.value})}/><select className="input" value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}><option>ALL</option><option>COLLECTED</option><option>REDEEMED</option></select><input type="date" className="input" value={filters.date} onChange={e=>setFilters({...filters,date:e.target.value})}/></div><button className="btn-secondary w-full" onClick={()=>setFilters(EMPTY_FILTERS)}>Clear filters</button></Card>
    {results.length===0?<EmptyState title="No Puzzle records" message="No ownership records match the selected filters."/>:<div className="space-y-3">{results.map(r=><Card key={r.id} className="space-y-2"><div className="flex items-start justify-between"><div><p className="font-semibold">{r.items?.puzzle_code??`Puzzle #${r.id}`}</p><p className="text-sm text-ink-faint">Group {r.group_id} · {r.items?.puzzle_location} · {r.status}</p></div><button className="btn-secondary" disabled={busy===`o-${r.id}`} onClick={()=>void correct(r)}>Correct</button></div><p className="text-xs text-ink-faint">Station {r.obtained_station_id??"—"} · {new Date(r.created_at).toLocaleString()}</p>{r.redeemed_at&&<p className="text-xs text-amber-700">Redeemed {new Date(r.redeemed_at).toLocaleString()} — correction requires dependency confirmation.</p>}</Card>)}</div>}
  </div>;
}
