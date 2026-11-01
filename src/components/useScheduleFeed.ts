"use client";

import { useSharedFeed, type FeedSource } from "@/lib/sharedFeed";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ScheduleItem } from "@/lib/types";

// schedule_items and schedule_days, live, shared by every reader on the page
// (the Welcome page's Schedule and the event countdown used to fetch and
// subscribe to both twice). See src/lib/sharedFeed.ts.

export interface ScheduleDay {
  day_label: string;
  day_date: string;
}

function tableChannel(table: string, reload: () => void) {
  const supabase = supabaseBrowser();
  const channel = supabase
    .channel(`${table}-feed-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, reload)
    .subscribe();
  return () => void supabase.removeChannel(channel);
}

function itemsSource(): FeedSource<ScheduleItem[]> {
  return {
    async load() {
      const { data } = await supabaseBrowser()
        .from("schedule_items")
        .select("*")
        .order("sort_order")
        .order("id");
      // A failed load counts as "no entries yet".
      return (data as ScheduleItem[] | null) ?? [];
    },
    listen: (reload) => tableChannel("schedule_items", reload),
    reloadOnVisible: false,
  };
}

function daysSource(): FeedSource<ScheduleDay[]> {
  return {
    async load() {
      const { data } = await supabaseBrowser()
        .from("schedule_days")
        .select("day_label, day_date")
        .order("day_date");
      return (data as ScheduleDay[] | null) ?? undefined;
    },
    listen: (reload) => tableChannel("schedule_days", reload),
    reloadOnVisible: false,
  };
}

/** Every schedule item, in sort_order then id order. undefined while loading. */
export function useScheduleItems(): ScheduleItem[] | undefined {
  return useSharedFeed("schedule_items", itemsSource);
}

/** Each day's date, in date order. undefined until loaded. */
export function useScheduleDays(): ScheduleDay[] | undefined {
  return useSharedFeed("schedule_days", daysSource);
}
