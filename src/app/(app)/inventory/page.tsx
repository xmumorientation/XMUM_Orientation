"use client";

import { Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { FreshieItems } from "@/components/freshie/items/FreshieItems";
import { SAMPLE_SCENARIOS, sampleItems, withLastTrackPiece, type SampleScenario } from "@/components/freshie/items/sampleData";
import type { BoxKind, BoxReward, ItemsData } from "@/components/freshie/items/types";

import { PuzzleBoard } from "@/components/PuzzleBoard";
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
import { cn } from "@/lib/utils";

export default function InventoryPage() {
  const profile = useProfile();
  if (profile.role === "freshie" || profile.role === "faci") {
    return (
      <Suspense>
        <ItemsPreview />
      </Suspense>
    );
  }
  return <GroupInventory />;
}

// SAMPLE DATA: Freshie and facilitator Items page. Everything shown here comes
// from sampleData.ts, not from the game. TODO: wire to the bonding-session game
// data before the event. With no ?demo it plays "complete": the last T&F
// piece arrives after a moment, with a Replay button. ?demo=day1|day2|ready|
// taken|won picks another state. Opening a box only changes the sample in
// this browser. In the sample, Freshies can open boxes too so the blind box
// flow can be demoed; on live data only the Faci can.
function ItemsPreview() {
  const profile = useProfile();
  const { group } = useGroup();
  const params = useSearchParams();
  const asked = params.get("demo");
  const scenario: SampleScenario = SAMPLE_SCENARIOS.includes(asked as SampleScenario) ? (asked as SampleScenario) : "complete";

  const [data, setData] = useState<ItemsData>(() => sampleItems(scenario));
  const [run, setRun] = useState(0);
  useEffect(() => {
    setData(sampleItems(scenario));
    if (scenario !== "complete") return;
    const timer = window.setTimeout(() => setData(withLastTrackPiece), 1500);
    return () => window.clearTimeout(timer);
  }, [scenario, run]);

  const view: ItemsData = {
    ...data,
    group: { id: group?.id ?? data.group.id, name: group?.name ?? data.group.name },
  };

  // Sample rules: a standard box gives 1–2 tokens; a gold box gives 4–6
  // tokens, or (1 in 3, on Day 2) a piece the group is still missing.
  // DEMO: the box count is not reduced, so boxes can be opened again and again.
  async function openBox(kind: BoxKind): Promise<BoxReward | null> {
    const reward = sampleReward(kind, data);
    const amount = reward.type === "tokens" ? reward.amount : 0;
    setData((d) => ({
      ...d,
      tokens: { balance: d.tokens.balance + amount },
      pieces:
        reward.type === "piece"
          ? { ...d.pieces, [reward.loc]: [...d.pieces[reward.loc], reward.piece].sort((x, y) => x - y) }
          : d.pieces,
      boxes: { ...d.boxes, [kind]: { unopened: d.boxes[kind].unopened, opened: [...d.boxes[kind].opened, amount] } },
      history: [
        {
          id: `open-${Date.now()}`,
          kind: "box",
          day: d.phase === "day1" ? 1 : 2,
          title: `Opened a ${kind} box`,
          detail: reward.type === "piece" ? `Got {${reward.loc}} piece #${reward.piece}` : "Opened by your Faci",
          amount,
          time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
        },
        ...d.history,
      ],
    }));
    return reward;
  }

  return (
    <>
      <FreshieItems
        data={view}
        groupColor={group?.color}
        canOpenBoxes
        onOpenBox={openBox}
        sample
      />
      {scenario === "complete" && (
        <button type="button" className="fi-replay" onClick={() => setRun((n) => n + 1)}>
          Replay demo
        </button>
      )}
    </>
  );
}

function sampleReward(kind: BoxKind, data: ItemsData): BoxReward {
  if (kind === "gold" && data.phase !== "day1" && Math.random() < 1 / 3) {
    const open = PROJECTOR_LOCATIONS.filter((loc) => !data.projectors[loc] && data.pieces[loc].length < PIECES_PER_SET);
    const loc = open[Math.floor(Math.random() * open.length)];
    if (loc) {
      const missing = [1, 2, 3, 4, 5].filter((n) => !data.pieces[loc].includes(n));
      return { type: "piece", loc, piece: missing[Math.floor(Math.random() * missing.length)] };
    }
  }
  const amount = kind === "gold" ? 4 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2);
  return { type: "tokens", amount };
}

// v2 inventory: 5 pieces per location; owned pieces render their slice of
// the Admin-uploaded picture and merge into the full image when complete.
function GroupInventory() {
  const profile = useProfile();
  const { group } = useGroup();
  const { config } = useConfig();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile.group_id) {
      setLoading(false);
      return;
    }
    let active = true;

    async function load() {
      const { data } = await supabase
        .from("inventory")
        .select("*, items(*)")
        .eq("group_id", profile.group_id!)
        .order("created_at", { ascending: false });
      if (active) {
        setEntries((data as InventoryEntry[]) ?? []);
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
        subtitle={`Collect all ${PIECES_PER_SET} pieces of each blueprint to reveal your group's image`}
      />

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
    </div>
  );
}
