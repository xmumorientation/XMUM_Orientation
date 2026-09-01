"use client";

import { Users } from "lucide-react";

import { Card } from "@/components/ui";
import type { FreshieGroupStats } from "@/lib/types";
import { cn } from "@/lib/utils";

// Real-time visualization of headcount / gender / nationality balance
// per group. Bars animate on value change via CSS transitions so desk
// operators can watch the groups balance themselves live (gamification
// requirement). Reused on both the registration desk and (later) any
// admin monitoring view.
export function FreshieLiveDashboard({
  stats,
  loading,
  highlightGroupId,
  targetAverage,
  compact = false,
}: {
  stats: FreshieGroupStats[];
  loading?: boolean;
  highlightGroupId?: number | null;
  targetAverage?: number | null;
  compact?: boolean;
}) {
  const maxHeadcount = Math.max(1, ...stats.map((s) => s.headcount));

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card h-32 animate-pulse bg-paper-100" />
        ))}
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-ink-faint">
        No groups configured yet. Set the total number of groups above to get started.
      </Card>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-3",
        compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"
      )}
    >
      {stats.map((s) => {
        const barPct = Math.round((s.headcount / maxHeadcount) * 100);
        const malePct = s.headcount ? Math.round((s.male_count / s.headcount) * 100) : 0;
        const femalePct = 100 - malePct;
        const localPct = s.headcount ? Math.round((s.local_count / s.headcount) * 100) : 0;
        const intlPct = 100 - localPct;
        const isHighlighted = highlightGroupId === s.group_id;
        const overAverage =
          targetAverage != null && s.headcount > targetAverage + 1;

        return (
          <Card
            key={s.group_id}
            className={cn(
              "space-y-3 p-4 transition-all duration-500",
              isHighlighted && "ring-2 ring-brand-1 shadow-overlay"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-bold text-ink">
                <Users size={16} strokeWidth={1.75} className="text-brand-1" />
                {s.group_name}
              </span>
              <span
                className={cn(
                  "chip",
                  overAverage
                    ? "bg-amber-100 text-amber-800"
                    : "bg-brand-1/10 text-brand-1"
                )}
              >
                {s.headcount} {s.headcount === 1 ? "person" : "people"}
              </span>
            </div>

            {/* Headcount bar relative to the largest group — visually shows balance */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-paper-100">
              <div
                className="h-full rounded-full bg-[image:linear-gradient(90deg,theme(colors.brand.1),theme(colors.brand.2))] transition-all duration-700 ease-out"
                style={{ width: `${barPct}%` }}
              />
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-ink-faint">Gender</span>
                <span className="font-semibold tabular-nums">
                  {s.male_count}M / {s.female_count}F
                </span>
              </div>
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-paper-100">
                <div
                  className="h-full bg-sky-500 transition-all duration-700 ease-out"
                  style={{ width: `${malePct}%` }}
                />
                <div
                  className="h-full bg-pink-400 transition-all duration-700 ease-out"
                  style={{ width: `${femalePct}%` }}
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-ink-faint">Nationality</span>
                <span className="font-semibold tabular-nums">
                  {s.local_count} Local / {s.international_count} Intl
                </span>
              </div>
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-paper-100">
                <div
                  className="h-full bg-emerald-500 transition-all duration-700 ease-out"
                  style={{ width: `${localPct}%` }}
                />
                <div
                  className="h-full bg-violet-400 transition-all duration-700 ease-out"
                  style={{ width: `${intlPct}%` }}
                />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
stop}
