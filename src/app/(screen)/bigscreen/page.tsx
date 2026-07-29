"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useDesignVariant } from "@/components/DesignVariantProvider";
import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import { useConfig } from "@/components/useConfig";
import { SoftBigScreen } from "@/components/soft/SoftBigScreen";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  PROJECTOR_LABELS,
  PROJECTOR_LOCATIONS,
  type ProjectorLocation,
} from "@/lib/types";
import { cn, formatCountdown, hexToRgbChannels } from "@/lib/utils";

interface GroupRow {
  id: number;
  name: string;
  token_balance: number;
}

interface Standing {
  group: GroupRow;
  pieces: Record<ProjectorLocation, number>;
  totalPieces: number;
  bestLocation: number;
  activated: ProjectorLocation | null;
  activatedAt: string | null;
}

const PIECES_PER_SET = 5;

// Race to a projector: an activated projector beats any partial progress
// (earlier activation ranks higher), then closest-to-completing a single
// set, then total pieces, then tokens as the tiebreaker.
function compareStandings(a: Standing, b: Standing): number {
  if (!!a.activated !== !!b.activated) return a.activated ? -1 : 1;
  if (a.activated && b.activated && a.activatedAt !== b.activatedAt) {
    return (a.activatedAt ?? "") < (b.activatedAt ?? "") ? -1 : 1;
  }
  if (a.bestLocation !== b.bestLocation) return b.bestLocation - a.bestLocation;
  if (a.totalPieces !== b.totalPieces) return b.totalPieces - a.totalPieces;
  if (a.group.token_balance !== b.group.token_balance) {
    return b.group.token_balance - a.group.token_balance;
  }
  return a.group.name.localeCompare(b.group.name);
}

function ScreenClock() {
  const { phases, offsetMs, tick } = usePhaseTimer();
  void tick;

  const active = phases.find((p) => p.state === "active");
  const paused = phases.find((p) => p.state === "paused");
  const current = active ?? paused;
  const serverNow = Date.now() + offsetMs;

  if (!current) {
    return (
      <p className="text-right font-mono text-2xl tabular-nums text-white/60 lg:text-4xl">
        {new Date(serverNow).toLocaleTimeString("en-GB")}
      </p>
    );
  }

  const remaining =
    current.state === "paused"
      ? (current.paused_remaining ?? 0)
      : current.ends_at
        ? (new Date(current.ends_at).getTime() - serverNow) / 1000
        : 0;

  return (
    <div className="text-right">
      <p
        className={cn(
          "text-xs font-black uppercase tracking-[0.3em] lg:text-sm",
          current.is_endgame ? "text-red-400" : "text-white/50"
        )}
      >
        {current.is_endgame ? "Endgame" : current.name}
        {current.state === "paused" ? " · paused" : ""}
      </p>
      <p
        className={cn(
          "font-mono text-4xl font-black tabular-nums lg:text-6xl",
          current.is_endgame ? "animate-pulse text-red-400" : "text-white"
        )}
      >
        {formatCountdown(remaining)}
      </p>
    </div>
  );
}

function PieceDots({ have }: { have: number }) {
  return (
    <span className="flex gap-1 lg:gap-1.5">
      {Array.from({ length: PIECES_PER_SET }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-2 w-2 rounded-full lg:h-3 lg:w-3",
            i < have ? "bg-[var(--brand-1)]" : "bg-white/15"
          )}
        />
      ))}
    </span>
  );
}

export default function BigScreenPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { variant } = useDesignVariant();
  const { brand } = useConfig();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [pieceRows, setPieceRows] = useState<
    { group_id: number; location: ProjectorLocation }[]
  >([]);
  const [projectors, setProjectors] = useState<
    { location: ProjectorLocation; activated_by_group: number | null; activated_at: string | null }[]
  >([]);

  useEffect(() => {
    let active = true;

    async function load() {
      const [g, inv, proj] = await Promise.all([
        supabase.from("groups").select("id, name, token_balance").order("id"),
        supabase
          .from("inventory")
          .select("group_id, items(puzzle_location)")
          .eq("item_type", "puzzle"),
        supabase
          .from("projectors")
          .select("location, activated_by_group, activated_at"),
      ]);
      if (!active) return;
      if (g.data) setGroups(g.data as GroupRow[]);
      if (inv.data) {
        setPieceRows(
          (inv.data as unknown as {
            group_id: number;
            items: { puzzle_location: ProjectorLocation | null } | null;
          }[])
            .filter((r) => r.items?.puzzle_location)
            .map((r) => ({
              group_id: r.group_id,
              location: r.items!.puzzle_location!,
            }))
        );
      }
      if (proj.data) {
        setProjectors(
          proj.data as {
            location: ProjectorLocation;
            activated_by_group: number | null;
            activated_at: string | null;
          }[]
        );
      }
    }

    load();
    const channel = supabase
      .channel("bigscreen-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "groups" },
        load
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory" },
        load
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projectors" },
        load
      )
      .subscribe();
    // Realtime can drop silently on flaky event-day networks — a slow poll
    // keeps the projector honest without hammering the DB.
    const poll = setInterval(load, 60_000);
    return () => {
      active = false;
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [supabase]);

  const standings: Standing[] = useMemo(() => {
    const byGroup = new Map<number, Record<ProjectorLocation, number>>();
    for (const row of pieceRows) {
      const rec =
        byGroup.get(row.group_id) ??
        (Object.fromEntries(
          PROJECTOR_LOCATIONS.map((l) => [l, 0])
        ) as Record<ProjectorLocation, number>);
      rec[row.location] += 1;
      byGroup.set(row.group_id, rec);
    }
    return groups
      .map((group) => {
        const pieces =
          byGroup.get(group.id) ??
          (Object.fromEntries(
            PROJECTOR_LOCATIONS.map((l) => [l, 0])
          ) as Record<ProjectorLocation, number>);
        const counts = PROJECTOR_LOCATIONS.map((l) => pieces[l]);
        const activation = projectors.find(
          (p) => p.activated_by_group === group.id
        );
        return {
          group,
          pieces,
          totalPieces: counts.reduce((s, n) => s + n, 0),
          bestLocation: Math.max(...counts),
          activated: activation?.location ?? null,
          activatedAt: activation?.activated_at ?? null,
        };
      })
      .sort(compareStandings);
  }, [groups, pieceRows, projectors]);

  const activatedCount = projectors.filter((p) => p.activated_by_group).length;

  const brandVars = {
    "--brand-1": brand.brandPrimary,
    "--brand-2": brand.brandSecondary,
    "--brand-1-rgb": hexToRgbChannels(brand.brandPrimary),
    "--brand-2-rgb": hexToRgbChannels(brand.brandSecondary),
  } as React.CSSProperties;

  if (variant === "soft") {
    return (
      <div className="min-h-dvh bg-night-900" style={brandVars}>
        <SoftBigScreen
          eventName={brand.eventName}
          eventTagline={brand.eventTagline}
          standings={standings}
          activatedCount={activatedCount}
        />
      </div>
    );
  }

  return (
    <div
      className="min-h-dvh bg-night-900 px-4 py-4 text-white lg:px-10 lg:py-8"
      style={brandVars}
    >
      <header className="flex items-start justify-between gap-4">
        <Link href="/committee" className="min-w-0">
          <p className="truncate text-3xl font-black tracking-tight lg:text-6xl">
            <span className="bg-gradient-to-r from-[var(--brand-1)] to-[var(--brand-2)] bg-clip-text text-transparent">
              {brand.eventName}
            </span>
          </p>
          {brand.eventTagline && (
            <p className="mt-1 truncate text-sm text-white/50 lg:text-xl">
              {brand.eventTagline}
            </p>
          )}
        </Link>
        <ScreenClock />
      </header>

      <div className="mt-4 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.25em] text-white/40 lg:mt-8 lg:text-sm">
        <span>Leaderboard</span>
        <span className="h-px flex-1 bg-white/10" />
        <span>
          Projectors {activatedCount}/{PROJECTOR_LOCATIONS.length} activated
        </span>
      </div>

      <ol className="mt-3 space-y-2 lg:mt-5 lg:space-y-3">
        {standings.map((s, idx) => (
          <li
            key={s.group.id}
            className={cn(
              "flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors lg:gap-6 lg:px-6 lg:py-4",
              s.activated
                ? "border-amber-400/60 bg-amber-400/10"
                : idx === 0
                  ? "border-[var(--brand-1)] bg-white/[0.06]"
                  : "border-white/10 bg-white/[0.03]"
            )}
          >
            <span
              className={cn(
                "w-8 shrink-0 text-center font-mono text-xl font-black tabular-nums lg:w-14 lg:text-4xl",
                idx === 0
                  ? "text-amber-300"
                  : idx < 3
                    ? "text-white/80"
                    : "text-white/35"
              )}
            >
              {idx + 1}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-lg font-black lg:text-3xl">
                {s.group.name}
              </span>
              {s.activated && (
                <span className="mt-0.5 inline-block rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-950 lg:text-xs">
                  {PROJECTOR_LABELS[s.activated]} activated
                </span>
              )}
            </span>

            <span className="hidden shrink-0 gap-4 sm:flex lg:gap-8">
              {PROJECTOR_LOCATIONS.map((loc) => (
                <span key={loc} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-black tracking-widest text-white/40 lg:text-xs">
                    {loc}
                  </span>
                  <PieceDots have={s.pieces[loc]} />
                </span>
              ))}
            </span>

            <span className="w-20 shrink-0 text-right lg:w-32">
              <span className="font-mono text-2xl font-black tabular-nums text-[var(--brand-1)] lg:text-5xl">
                {s.group.token_balance}
              </span>
              <span className="block text-[10px] font-bold uppercase tracking-widest text-white/40 lg:text-xs">
                tokens
              </span>
            </span>
          </li>
        ))}
      </ol>

      {standings.length === 0 && (
        <p className="mt-16 text-center text-xl text-white/40">
          Waiting for groups…
        </p>
      )}
    </div>
  );
}
