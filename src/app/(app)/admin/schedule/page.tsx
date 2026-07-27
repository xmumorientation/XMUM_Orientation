"use client";

import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Card, ErrorBanner, PageTitle, SuccessBanner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ScheduleItem } from "@/lib/types";

// Admin editor for the event rundown shown on /schedule.
export default function AdminSchedulePage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [form, setForm] = useState({
    day_label: "Day 1",
    time_label: "",
    title: "",
    location: "",
    description: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("schedule_items")
      .select("*")
      .order("day_label")
      .order("sort_order")
      .order("id");
    setItems((data as ScheduleItem[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.from("schedule_items").insert({
      ...form,
      sort_order: items.filter((i) => i.day_label === form.day_label).length,
    });
    if (error) setError(error.message);
    else {
      setForm({ ...form, time_label: "", title: "", location: "", description: "" });
      setNotice("Added.");
      setTimeout(() => setNotice(null), 1500);
      load();
    }
  }

  async function remove(id: number) {
    const { error } = await supabase.from("schedule_items").delete().eq("id", id);
    if (error) setError(error.message);
    else load();
  }

  const days = [...new Set(items.map((i) => i.day_label))];

  return (
    <div className="space-y-4">
      <PageTitle title="Schedule editor" subtitle="What Freshies see on /schedule" />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <Card>
        <form onSubmit={add} className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input text-sm"
              placeholder='Day, e.g. "Day 1"'
              required
              value={form.day_label}
              onChange={(e) => setForm({ ...form, day_label: e.target.value })}
            />
            <input
              className="input text-sm"
              placeholder="09:00 – 10:30"
              required
              value={form.time_label}
              onChange={(e) => setForm({ ...form, time_label: e.target.value })}
            />
          </div>
          <input
            className="input text-sm"
            placeholder="Activity title"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input text-sm"
              placeholder="Location (optional)"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
            <input
              className="input text-sm"
              placeholder="Note (optional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <button type="submit" className="btn-primary w-full">
            + Add item
          </button>
        </form>
      </Card>

      {days.map((day) => (
        <Card key={day} className="p-0">
          <p className="border-b border-paper-200 px-4 py-2 text-sm font-bold">
            {day}
          </p>
          <div className="divide-y divide-paper-200">
            {items
              .filter((i) => i.day_label === day)
              .map((i) => (
                <div key={i.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="w-24 text-xs tabular-nums text-ink-faint">
                    {i.time_label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.title}</p>
                    {(i.location || i.description) && (
                      <p className="truncate text-xs text-ink-faint">
                        {[i.location, i.description].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => remove(i.id)}
                    className="text-sm text-red-500"
                    aria-label={`Delete ${i.title}`}
                  >
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                </div>
              ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
