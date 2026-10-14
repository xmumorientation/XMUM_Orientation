"use client";

import { useEffect, useMemo, useState } from "react";

import { CampusMap } from "@/components/CampusMap";
import { useProfile } from "@/components/ProfileProvider";
import { GameControl } from "@/components/staff/game/GameControl";
import { Card, PageTitle } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Group } from "@/lib/types";
import { cn } from "@/lib/utils";

type OpsView = "map" | "attendance" | "balances";

// Ops. HOGM runs the game here (Game control: Admin's game console). HOF and
// Committee keep the overview below.
export default function CommitteePage() {
  const profile = useProfile();
  return profile.role === "hogm" ? <GameControl /> : <OpsOverview />;
}

// Committee-tier operations: live map (FR-3.4), attendance completion
// (FR-2.3), blind-box QR card, register counter (FR-12.1).
function OpsOverview() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [groups, setGroups] = useState<Group[]>([]);
  const [headcounts, setHeadcounts] = useState<Record<number, number>>({});
  const [view, setView] = useState<OpsView>("map");

  // A tab can be opened directly: /committee?view=attendance.
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    if (v === "map" || v === "attendance" || v === "balances") setView(v);
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      const [{ data: gs }, { data: hcs }] = await Promise.all([
        supabase.from("groups").select("*").order("id"),
        supabase.from("group_headcounts").select("group_id, headcount"),
      ]);
      if (!active) return;
      setGroups((gs as Group[]) ?? []);
      const map: Record<number, number> = {};
      for (const row of hcs ?? []) {
        const rec = row as { group_id: number; headcount: number };
        map[rec.group_id] = rec.headcount;
      }
      setHeadcounts(map);
    }
    load();

    const channel = supabase
      .channel("headcount-dash")
      .on("postgres_changes", { event: "*", schema: "public", table: "group_headcounts" }, load)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const tabs: { key: OpsView; label: string; desc: string }[] = [
    { key: "map", label: "Map", desc: "Live location view" },
    { key: "attendance", label: "Headcount", desc: "People per group" },
    { key: "balances", label: "Balances", desc: "Token overview" },
  ];

  return (
    <div className="space-y-4">
      <PageTitle title="Operations" subtitle="Live situational awareness" />

      <div className="grid grid-cols-3 gap-2 rounded-[1.5rem] bg-paper-200 p-1.5">
        {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-pressed={view === tab.key}
              onClick={() => setView(tab.key)}
              className={cn(
                "min-h-[64px] rounded-[1.15rem] px-3 text-left transition",
                view === tab.key
                  ? "bg-white text-ink shadow-card"
                  : "text-ink-faint hover:bg-white/50"
              )}
            >
              <span className="block text-sm font-black">{tab.label}</span>
              <span className="mt-1 block text-xs leading-4">{tab.desc}</span>
            </button>
          ))}
      </div>

      {view === "map" && (
        <section>
          <h2 className="mb-2 font-semibold">Live map</h2>
          <CampusMap showGroupPins />
        </section>
      )}

      {view === "attendance" && (
        <section>
          <h2 className="mb-2 font-semibold">Headcount</h2>
          <Card className="divide-y divide-paper-200 p-0">
            {groups.map((g) => {
              const count = headcounts[g.id];
              return (
                <div key={g.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm font-medium">{g.name}</span>
                  <span className="text-sm font-bold tabular-nums text-ink">
                    {count == null ? "—" : count}
                  </span>
                </div>
              );
            })}
          </Card>
        </section>
      )}

      {view === "balances" && (
        <section>
          <h2 className="mb-2 font-semibold">Group balances</h2>
          <Card className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {groups.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between rounded-xl bg-paper-100 px-3 py-2 text-sm"
              >
                <span>{g.name}</span>
                <span className="font-bold tabular-nums">{g.token_balance} tokens</span>
              </div>
            ))}
          </Card>
        </section>
      )}

    </div>
  );
}
