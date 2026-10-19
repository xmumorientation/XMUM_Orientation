"use client";

import { useEffect, useMemo, useState } from "react";

import { BlindBoxCard } from "@/components/BlindBoxCard";
import { GroupBadge } from "@/components/GroupBadge";
import { useProfile } from "@/components/ProfileProvider";
import { FaciControl } from "@/components/staff/faci/FaciControl";
import { GameControl } from "@/components/staff/game/GameControl";
import { Card, PageTitle } from "@/components/ui";
import { clock, describeLocation, type FaciLocation } from "@/lib/faciLocation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Group } from "@/lib/types";
import { cn } from "@/lib/utils";

type OpsView = "headcount" | "location" | "freshies";

type Headcount = {
  group_id: number;
  headcount: number;
  local_count: number | null;
  international_count: number | null;
};

// Ops. HOGM runs the game here (Game control: Admin's game console), HOF runs
// the Facilitators (Faci control: every group's name, slogan, password,
// Facilitators, headcount and location). Committee keeps the overview below.
export default function CommitteePage() {
  const profile = useProfile();
  if (profile.role === "hogm") return <GameControl />;
  if (profile.role === "hof") return <FaciControl />;
  return <OpsOverview />;
}

// Committee (and Admin): one row per group (its number on its colour) in three
// tabs. All read only and live; Admin edits them in Admin → Freshies.
//   Headcount  Local / International / Total, as Facilitators report it
//   Location   the group's latest manual location update
//   Freshies   the group's name, slogan and 4-digit password (migration 0092)
// The map is the Map tab, and token totals are the Scores tab.
function OpsOverview() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [groups, setGroups] = useState<Group[]>([]);
  const [headcounts, setHeadcounts] = useState<Record<number, Headcount>>({});
  const [locations, setLocations] = useState<Record<number, FaciLocation>>({});
  const [senders, setSenders] = useState<Record<string, string>>({});
  const [codes, setCodes] = useState<Record<number, string>>({});
  const [view, setView] = useState<OpsView>("headcount");

  // Home's Live floor tiles open a tab directly: /committee?view=headcount.
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    if (v === "headcount" || v === "location" || v === "freshies") setView(v);
    else if (v === "attendance") setView("headcount"); // older links
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      const [gs, hcs, locs, facis, logins] = await Promise.all([
        supabase.from("groups").select("*").order("id"),
        supabase.from("group_headcounts").select("group_id, headcount, local_count, international_count"),
        supabase
          .from("faci_location_updates")
          .select("id, user_id, group_id, status, other_text, building, details, created_at, edited_by, edited_at")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(500),
        supabase.from("profiles").select("id, full_name").eq("role", "faci"),
        supabase.from("group_login_codes").select("group_id, code"),
      ]);
      if (!active) return;
      setGroups((gs.data as Group[]) ?? []);
      setHeadcounts(Object.fromEntries(((hcs.data as Headcount[]) ?? []).map((h) => [h.group_id, h])));
      // newest first: keep each group's first (latest) update
      const latest: Record<number, FaciLocation> = {};
      for (const l of (locs.data as FaciLocation[]) ?? []) latest[l.group_id] ??= l;
      setLocations(latest);
      setSenders(
        Object.fromEntries(
          ((facis.data as { id: string; full_name: string | null }[]) ?? []).map((f) => [f.id, f.full_name || "Facilitator"])
        )
      );
      setCodes(Object.fromEntries(((logins.data as { group_id: number; code: string }[]) ?? []).map((c) => [c.group_id, c.code])));
    }
    load();

    const channel = supabase
      .channel(`ops-overview-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_headcounts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "faci_location_updates" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, load)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const tabs: { key: OpsView; label: string; desc: string }[] = [
    { key: "headcount", label: "Headcount", desc: "People per group" },
    { key: "location", label: "Location", desc: "Where each group is" },
    { key: "freshies", label: "Freshies", desc: "Name, slogan, password" },
  ];

  const name = (g: Group) => g.display_name?.trim() || g.name;

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
              view === tab.key ? "bg-white text-ink shadow-card" : "text-ink-faint hover:bg-white/50"
            )}
          >
            <span className="block text-sm font-black">{tab.label}</span>
            <span className="mt-1 block text-xs leading-4">{tab.desc}</span>
          </button>
        ))}
      </div>

      {/* Home's "My blind box QR" tool links here (#blindbox). */}
      <div id="blindbox" className="scroll-mt-4">
        <BlindBoxCard showEmpty />
      </div>

      {view === "headcount" && (
        <section>
          <h2 className="mb-2 font-semibold">Headcount</h2>
          <Card className="divide-y divide-paper-200 p-0">
            <div className="grid grid-cols-[1fr_repeat(3,3.25rem)] items-center gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              <span>Group</span>
              <span className="text-right">Local</span>
              <span className="text-right">Intl</span>
              <span className="text-right">Total</span>
            </div>
            {groups.map((g) => {
              const h = headcounts[g.id];
              const n = (v: number | null | undefined) => (v == null ? "—" : v);
              return (
                <div key={g.id} className="grid grid-cols-[1fr_repeat(3,3.25rem)] items-center gap-2 px-4 py-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <GroupBadge id={g.id} color={g.color} />
                    <span className="truncate text-sm font-medium" title={name(g)}>
                      {name(g)}
                    </span>
                  </span>
                  <span className="text-right text-sm tabular-nums">{n(h?.local_count)}</span>
                  <span className="text-right text-sm tabular-nums">{n(h?.international_count)}</span>
                  <span className="text-right text-sm font-bold tabular-nums text-ink">{n(h?.headcount)}</span>
                </div>
              );
            })}
          </Card>
        </section>
      )}

      {view === "location" && (
        <section>
          <h2 className="mb-2 font-semibold">Location</h2>
          <Card className="divide-y divide-paper-200 p-0">
            {groups.map((g) => {
              const l = locations[g.id];
              return (
                <div key={g.id} className="flex items-start gap-3 px-4 py-3">
                  <GroupBadge id={g.id} color={g.color} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name(g)}</p>
                    {l ? (
                      <>
                        <p className="text-sm font-bold text-ink">{describeLocation(l)}</p>
                        {l.details && <p className="text-sm text-ink-faint">{l.details}</p>}
                        <p className="mt-0.5 text-xs text-ink-faint">
                          {senders[l.user_id] ?? "Facilitator"} · {clock(l.created_at)}
                          {l.edited_at ? " · edited by Admin" : ""}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-ink-faint">No update yet</p>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        </section>
      )}

      {view === "freshies" && (
        <section>
          <h2 className="mb-2 font-semibold">Freshies</h2>
          <Card className="divide-y divide-paper-200 p-0">
            {groups.map((g) => (
              <div key={g.id} className="flex items-center gap-3 px-4 py-3">
                <GroupBadge id={g.id} color={g.color} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{name(g)}</p>
                  <p className="text-sm text-ink-faint">{g.slogan?.trim() || "No slogan yet"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-faint">Password</span>
                  <span className="font-mono text-base font-black tabular-nums text-ink">{codes[g.id] ?? "—"}</span>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
