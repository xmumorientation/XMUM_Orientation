"use client";

import { useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { Card, EmptyState, PageTitle, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  PROJECTOR_LABELS,
  PROJECTOR_LOCATIONS,
  type InventoryEntry,
  type Item,
  type ProjectorLocation,
} from "@/lib/types";
import { cn } from "@/lib/utils";

// FR-6.1/6.5: group inventory with per-location set-completion progress.
// FR-8.1: the assembled "QR" is celebratory display only — completion truth
// lives in the database.
export default function InventoryPage() {
  const profile = useProfile();
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
        <EmptyState message="You'll see your group's items here once you're assigned to a group." />
      </div>
    );
  }

  const puzzles = entries.filter((e) => e.items?.type === "puzzle");
  const cards = entries.filter((e) => e.items?.type === "facility_card");

  const piecesByLocation = (loc: ProjectorLocation): Item[] =>
    puzzles
      .filter((e) => e.items?.puzzle_location === loc)
      .map((e) => e.items!)
      .sort((a, b) => (a.puzzle_index ?? 0) - (b.puzzle_index ?? 0));

  return (
    <div className="space-y-4">
      <PageTitle
        title="Inventory"
        subtitle="Collect all 3 pieces of one blueprint to revive a projector"
      />

      {PROJECTOR_LOCATIONS.map((loc) => {
        const pieces = piecesByLocation(loc);
        const complete = pieces.length >= 3;
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
                    : "bg-base-200 text-ink-soft"
                )}
              >
                {pieces.length}/3 pieces
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((idx) => {
                const owned = pieces.some((p) => p.puzzle_index === idx);
                return (
                  <div
                    key={idx}
                    className={cn(
                      "flex aspect-square flex-col items-center justify-center rounded-xl border text-center",
                      owned
                        ? "border-star-goldsoft bg-star-goldsoft/20 shadow-glow"
                        : "border-dashed border-base-300 bg-base-100"
                    )}
                  >
                    <span className="text-2xl">{owned ? "🧩" : "❔"}</span>
                    <span className="text-xs text-ink-faint">Piece {idx}</span>
                  </div>
                );
              })}
            </div>
            {complete && (
              <p className="mt-2 text-center text-sm font-semibold text-star-gold">
                ✨ Set complete! Bring your group to the Guardian at{" "}
                {PROJECTOR_LABELS[loc]} to verify.
              </p>
            )}
          </Card>
        );
      })}

      <Card>
        <h2 className="mb-2 font-semibold">Facility cards ({cards.length})</h2>
        {cards.length === 0 ? (
          <p className="text-sm text-ink-faint">
            No facility cards yet — try your luck at the blind boxes!
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {cards.map((e) => (
              <li
                key={e.id}
                className="rounded-xl border border-star-violetsoft/50 bg-star-violetsoft/10 px-3 py-2"
              >
                <span className="block text-sm font-semibold">
                  🎠 {e.items?.name}
                </span>
                <span className="block text-xs text-ink-faint">
                  {new Date(e.created_at).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
