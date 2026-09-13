"use client";

import { Gift, QrCode, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { PuzzleBoard } from "@/components/PuzzleBoard";
import { BlindBoxQrScanner } from "@/components/BlindBoxQrScanner";
import { useToast } from "@/components/ToastProvider";
import { useProfile } from "@/components/ProfileProvider";
import { useConfig, puzzleImageUrl } from "@/components/useConfig";
import { useGroup } from "@/components/useGroup";
import { Card, EmptyState, PageTitle, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  PIECES_PER_SET,
  PROJECTOR_LABELS,
  PROJECTOR_LOCATIONS,
  type InventoryEntry,
  type ProjectorLocation,
} from "@/lib/types";
import { cn, friendlyError, idemKey } from "@/lib/utils";

interface GroupBlindBox { blind_box_id:string; type:"NORMAL"|"SPECIAL"; status:"CLAIMED"|"OPENED"; claimed_at:string; opened_at:string|null; reward_amount:number|null; reward_credit_status:string; }

// v2 inventory: 5 pieces per location; owned pieces render their slice of
// the Admin-uploaded picture and merge into the full image when complete.
export default function InventoryPage() {
  const profile = useProfile();
  const { group } = useGroup();
  const { config } = useConfig();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [boxes, setBoxes] = useState<GroupBlindBox[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selectedBox, setSelectedBox] = useState<GroupBlindBox | null>(null);
  const [reward, setReward] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadBoxes = useCallback(async()=>{const {data}=await supabase.rpc("fn_group_blind_boxes");setBoxes((data as GroupBlindBox[])??[])},[supabase]);

  const claimToken = useCallback(async(token:string)=>{setScannerOpen(false);setBusy(true);setActionError(null);try{const res=await fetch("/api/blindbox/source-claim",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,requestId:idemKey()})});const data=await res.json();if(!res.ok)throw new Error(data.error??"Unable to claim Blind Box");toast({message:"Blind Box obtained successfully.",tone:"success"});await loadBoxes()}catch(e){setActionError(friendlyError(e))}finally{setBusy(false)}},[loadBoxes,toast]);

  useEffect(() => {
    if (!profile.group_id) {
      setLoading(false);
      return;
    }
    let active = true;

    async function load() {
      const [{data},{data:boxData}] = await Promise.all([supabase.from("inventory").select("*, items(*)").eq("group_id",profile.group_id!).order("created_at",{ascending:false}),supabase.rpc("fn_group_blind_boxes")]);
      if (active) {
        setEntries((data as InventoryEntry[]) ?? []);
        setBoxes((boxData as GroupBlindBox[])??[]);
        setLoading(false);
      }
    }
    load();

    const channel = supabase
      .channel(`inventory-${profile.group_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "inventory",
          filter: `group_id=eq.${profile.group_id}`,
        },
        load
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, profile.group_id]);

  useEffect(()=>{const token=searchParams.get("blindbox_source");if(token&&profile.group_id){void claimToken(token);router.replace("/inventory")}},[searchParams,profile.group_id,claimToken,router]);

  async function openBox(){if(!selectedBox)return;setBusy(true);setActionError(null);const {data,error}=await supabase.rpc("fn_open_blind_box",{p_blind_box_id:selectedBox.blind_box_id,p_request_id:idemKey()});setBusy(false);if(error){setActionError(friendlyError(error));return}const amount=Number((data as {reward_amount:number}).reward_amount);setSelectedBox(null);setReward(amount);toast({message:`Your group received ${amount} tokens.`,tone:"success"});await loadBoxes()}

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!profile.group_id) {
    return (
      <div>
        <PageTitle title="Inventory" />
        <EmptyState message="You'll see your group's puzzle pieces here once you're assigned to a group." />
      </div>
    );
  }

  const ownedIndices = (loc: ProjectorLocation): number[] =>
    entries
      .filter(
        (e) => e.items?.type === "puzzle" && e.items?.puzzle_location === loc
      )
      .map((e) => e.items!.puzzle_index!)
      .sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Inventory"
        subtitle={group?.name??"Your group inventory"}
      />

      <Card className="flex items-center justify-between p-4"><div><p className="text-xs font-semibold uppercase text-ink-faint">Group tokens</p><p className="text-2xl font-bold tabular-nums">{group?.token_balance??0}</p></div><span className="chip bg-amber-100 text-amber-800">TOKEN</span></Card>

      {actionError&&<div role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{actionError}</div>}

      {PROJECTOR_LOCATIONS.map((loc) => {
        const owned = ownedIndices(loc);
        const complete = owned.length >= PIECES_PER_SET;
        return (
          <Card key={loc}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">
                {PROJECTOR_LABELS[loc]} Blueprint
              </h2>
              <span
                className={cn(
                  "chip",
                  complete
                    ? "bg-green-100 text-green-800"
                    : "bg-paper-200 text-ink-soft"
                )}
              >
                {owned.length}/{PIECES_PER_SET} pieces
              </span>
            </div>
            <PuzzleBoard
              ownedIndices={owned}
              imageUrl={puzzleImageUrl(config, loc)}
              complete={complete}
              groupName={group?.name}
            />
            {complete && (
              <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-sm font-semibold text-amber-500">
                <Sparkles size={16} strokeWidth={1.75} className="shrink-0" />
                Set complete! Bring your group to the Guardian at{" "}
                {PROJECTOR_LABELS[loc]} to verify.
              </p>
            )}
          </Card>
        );
      })}

      <Card><div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">Blind Box</h2><p className="text-xs text-ink-faint">{boxes.filter(b=>b.status==="CLAIMED").length} unopened</p></div><button disabled={busy} className="btn-primary px-4" onClick={()=>setScannerOpen(true)}><QrCode size={18}/>Scan</button></div><div className="grid grid-cols-4 gap-2">{boxes.map(b=><button key={b.blind_box_id} disabled={b.status!=="CLAIMED"} onClick={()=>setSelectedBox(b)} className={cn("aspect-square rounded-2xl border p-2",b.status==="CLAIMED"?"border-brand-1/30 bg-brand-1/10 text-brand-1":"border-paper-200 bg-paper-100 text-ink-faint")} aria-label={`${b.type} Blind Box ${b.status}`}><Gift className="mx-auto"/><span className="mt-1 block text-[10px] font-bold">{b.status==="OPENED"?`+${b.reward_amount}`:b.type}</span></button>)}</div>{boxes.length===0&&<p className="py-6 text-center text-sm text-ink-faint">No Blind Boxes claimed yet.</p>}</Card>

      <BlindBoxQrScanner open={scannerOpen} onResult={claimToken} onClose={()=>setScannerOpen(false)}/>
      {selectedBox&&<div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-3 sm:items-center"><Card className="w-full max-w-sm space-y-4 p-6 text-center"><h2 className="text-xl font-bold">Blind Box</h2><Gift className="mx-auto h-20 w-20 text-brand-1"/><p className="text-sm text-ink-faint">The reward was generated when this box was claimed and will be revealed once.</p><button disabled={busy} className="btn-primary w-full" onClick={openBox}>{busy?"Opening…":"Open Blind Box"}</button><button className="btn-secondary w-full" onClick={()=>setSelectedBox(null)}>Cancel</button></Card></div>}
      {reward!==null&&<div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-3"><Card className="w-full max-w-sm space-y-4 p-7 text-center"><Sparkles className="mx-auto h-16 w-16 text-amber-500"/><h2 className="text-xl font-bold">Reward</h2><p className="text-3xl font-black text-brand-1">+ {reward} tokens</p><button className="btn-primary w-full" onClick={()=>setReward(null)}>OK</button></Card></div>}
    </div>
  );
}
