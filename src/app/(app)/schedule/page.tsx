"use client";

import { MapPin, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { Card, EmptyState, ErrorBanner, PageTitle, Spinner, SuccessBanner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ScheduleItem } from "@/lib/types";

// Event rundown. Freshies see where to be. Admins edit the same list here.
export default function SchedulePage() {
  const profile = useProfile();
  const isAdmin = profile.role === "admin";
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const blank = {
    day_label: "Day 1",
    time_label: "",
    title: "",
    location: "",
    description: "",
  };
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("schedule_items")
      .select("*")
      .order("day_label")
      .order("sort_order")
      .order("id");
    return (data as ScheduleItem[]) ?? [];
  }, [supabase]);

  useEffect(() => {
    let active = true;
    async function run() {
      const next = await load();
      if (!active) return;
      setItems(next);
      setLoading(false);
    }
    run();
    const channel = supabase
      .channel("schedule-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schedule_items" },
        run
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [load, supabase]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 1500);
  }

  function startEdit(item: ScheduleItem) {
    setEditingId(item.id);
    setForm({
      day_label: item.day_label,
      time_label: item.time_label,
      title: item.title,
      location: item.location,
      description: item.description,
    });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(blank);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (editingId != null) {
      const { error } = await supabase
        .from("schedule_items")
        .update({
          day_label: form.day_label,
          time_label: form.time_label,
          title: form.title,
          location: form.location,
          description: form.description,
        })
        .eq("id", editingId);
      if (error) setError(error.message);
      else {
        setEditingId(null);
        setForm(blank);
        flash("Updated.");
        setItems(await load());
      }
      return;
    }
    const { error } = await supabase.from("schedule_items").insert({
      ...form,
      sort_order: items.filter((i) => i.day_label === form.day_label).length,
    });
    if (error) setError(error.message);
    else {
      setForm({ ...blank, day_label: form.day_label });
      flash("Added.");
      setItems(await load());
    }
  }

  async function remove(id: number) {
    const { error } = await supabase.from("schedule_items").delete().eq("id", id);
    if (error) setError(error.message);
    else setItems(await load());
  }

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
      {isAdmin && (
        <>
          <ErrorBanner message={error} />
          <SuccessBanner message={notice} />
          <Card>
            <form onSubmit={save} className="space-y-2">
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
              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1">
                  {editingId != null ? "Save changes" : "+ Add item"}
                </button>
                {editingId != null && (
                  <button type="button" className="btn-secondary px-4" onClick={cancelEdit}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </Card>
        </>
      )}
      {items.length === 0 ? (
        isAdmin ? null : (
          <EmptyState message="The schedule will appear here once the committee publishes it." />
        )
      ) : (
        days.map((day) => (
          <Card key={day} className="p-0">
            <p className="border-b border-paper-200 px-4 py-2.5 font-bold">
              {day}
            </p>
            <div className="divide-y divide-paper-200">
              {items
                .filter((i) => i.day_label === day)
                .map((i) => (
                  <div key={i.id} className="flex gap-3 px-4 py-3">
                    <span className="w-24 shrink-0 text-sm font-semibold tabular-nums text-brand-1">
                      {i.time_label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{i.title}</p>
                      {(i.location || i.description) && (
                        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-faint">
                          {i.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin size={14} strokeWidth={1.75} />
                              {i.location}
                            </span>
                          )}
                          {i.location && i.description && (
                            <span aria-hidden="true">·</span>
                          )}
                          {i.description}
                        </p>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(i)}
                          className="text-ink-soft"
                          aria-label={`Edit ${i.title}`}
                        >
                          <Pencil size={16} strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(i.id)}
                          className="text-red-500"
                          aria-label={`Delete ${i.title}`}
                        >
                          <Trash2 size={16} strokeWidth={1.75} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
