"use client";

import { useEffect, useMemo, useState } from "react";

import { Card, EmptyState, PageTitle, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ScheduleItem } from "@/lib/types";

// Event rundown — Freshies check "where should I be right now?".
export default function SchedulePage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase
        .from("schedule_items")
        .select("*")
        .order("day_label")
        .order("sort_order")
        .order("id");
      if (active) {
        setItems((data as ScheduleItem[]) ?? []);
        setLoading(false);
      }
    }
    load();
    const channel = supabase
      .channel("schedule-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schedule_items" },
        load
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const days = [...new Set(items.map((i) => i.day_label))];

  return (
    <div className="space-y-4">
      <PageTitle title="Schedule" subtitle="The full event rundown" />
      {items.length === 0 ? (
        <EmptyState message="The schedule will appear here once the committee publishes it." />
      ) : (
        days.map((day) => (
          <Card key={day} className="p-0">
            <p className="border-b border-base-200 px-4 py-2.5 font-bold">
              {day}
            </p>
            <div className="divide-y divide-base-200">
              {items
                .filter((i) => i.day_label === day)
                .map((i) => (
                  <div key={i.id} className="flex gap-3 px-4 py-3">
                    <span className="w-24 shrink-0 text-sm font-semibold tabular-nums text-star-cyan">
                      {i.time_label}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{i.title}</p>
                      {(i.location || i.description) && (
                        <p className="text-xs text-ink-faint">
                          {[i.location && `📍 ${i.location}`, i.description]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
