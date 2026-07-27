"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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

// v2 inventory: 5 pieces per location; owned pieces render their slice of
// the Admin-uploaded picture and merge into the full image when complete.
export default function InventoryPage() {
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
        subtitle={`Collect all ${PIECES_PER_SET} pieces of one blueprint to revive a projector`}
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
