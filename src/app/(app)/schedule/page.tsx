"use client";

import { ArrowDown, ArrowUp, GripVertical, MapPin, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FreshieSchedule } from "@/components/freshie/FreshieSchedule";
import { useProfile } from "@/components/ProfileProvider";
import { Card, EmptyState, ErrorBanner, PageTitle, Spinner, SuccessBanner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ScheduleItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const pad2 = (n: number) => String(n).padStart(2, "0");
// Planned times are entered and shown in the admin's local time (the event's).
function toLocalParts(iso: string | null) {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}
function toIso(date: string, time: string) {
  return date && time ? new Date(`${date}T${time}`).toISOString() : null;
}

// Event rundown. Freshies and facilitators share the night schedule.
// Admins edit the same list here.
export default function SchedulePage() {
  const profile = useProfile();
  if (profile.role === "freshie" || profile.role === "faci") return <FreshieSchedule />;
  return <StaffSchedule />;
}

function StaffSchedule() {
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
    date: "",
    start: "",
    end: "",
  };
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  // One date per day ("Day 1" → 2026-11-28), shared by all its items (0050).
  const [days, setDays] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    // Order is the admin's drag order (sort_order) within each day.
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
    async function runDays() {
      const { data } = await supabase.from("schedule_days").select("day_label, day_date");
      if (!active || !data) return;
      const map = Object.fromEntries(data.map((d) => [d.day_label, d.day_date as string]));
      setDays(map);
      // fill the add form's date for its day once the dates arrive
      setForm((f) => (f.date ? f : { ...f, date: map[f.day_label] ?? "" }));
    }
    run();
    runDays();
    const channel = supabase
      .channel("schedule-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schedule_items" },
        run
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schedule_days" },
        runDays
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
    const start = toLocalParts(item.starts_at);
    setForm({
      day_label: item.day_label,
      time_label: item.time_label,
      title: item.title,
      location: item.location,
      description: item.description,
      date: days[item.day_label] ?? start.date,
      start: start.time,
      end: toLocalParts(item.ends_at).time,
    });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ ...blank, date: days[blank.day_label] ?? "" });
    setError(null);
  }

  // Start/end times fill the text Freshies read; admin can still edit it.
  function setTimes(patch: Partial<Pick<typeof form, "start" | "end">>) {
    const next = { ...form, ...patch };
    if (next.start && next.end) next.time_label = `${next.start} – ${next.end}`;
    else if (next.start) next.time_label = next.start;
    setForm(next);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if ((form.start || form.end) && !form.date) return setError("Pick a date for the planned time.");
    if (form.start && form.end && form.end <= form.start) return setError("The end time must be after the start time.");
    // The date belongs to the day: save it once for every item of that day.
    if (form.date && form.date !== days[form.day_label]) {
      const { error: dayError } = await supabase
        .from("schedule_days")
        .upsert({ day_label: form.day_label, day_date: form.date, updated_at: new Date().toISOString() });
      if (dayError) return setError(`Could not save the day's date: ${dayError.message}`);
      setDays((d) => ({ ...d, [form.day_label]: form.date }));
    }
    const row = {
      day_label: form.day_label,
      time_label: form.time_label,
      title: form.title,
      location: form.location,
      description: form.description,
      starts_at: toIso(form.date, form.start),
      ends_at: toIso(form.date, form.end),
    };
    if (editingId != null) {
      const { error } = await supabase
        .from("schedule_items")
        .update(row)
        .eq("id", editingId);
      if (error) setError(error.message);
      else {
        setEditingId(null);
        setForm({ ...blank, date: days[blank.day_label] ?? "" });
        flash("Updated.");
        setItems(await load());
      }
      return;
    }
    const { error } = await supabase.from("schedule_items").insert({
      ...row,
      sort_order: items.filter((i) => i.day_label === form.day_label).length,
    });
    if (error) setError(error.message);
    else {
      setForm({ ...blank, day_label: form.day_label, date: form.date });
      flash("Added.");
      setItems(await load());
    }
  }

  // Move an item within its day: to another item's position (drag) or one
  // step up/down. Saves the whole day's order.
  async function reorder(day: string, fromId: number, toIndex: number) {
    const list = items.filter((i) => i.day_label === day);
    const from = list.findIndex((i) => i.id === fromId);
    if (from < 0 || toIndex < 0 || toIndex >= list.length || from === toIndex) return;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(toIndex, 0, moved);
    const order = new Map(next.map((i, idx) => [i.id, idx]));
    // show it straight away, then save
    setItems((all) =>
      [...all.map((i) => (order.has(i.id) ? { ...i, sort_order: order.get(i.id) as number } : i))].sort(
        (a, b) => a.day_label.localeCompare(b.day_label) || a.sort_order - b.sort_order || a.id - b.id
      )
    );
    const results = await Promise.all(
      next.map((i, idx) => supabase.from("schedule_items").update({ sort_order: idx }).eq("id", i.id))
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) setError(failed.error.message);
    else flash("Order saved.");
    setItems(await load());
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

  const dayLabels = [...new Set(items.map((i) => i.day_label))];

  return (
    <div className="space-y-4">
      <PageTitle title="Schedule" subtitle="The full event rundown" />
      {isAdmin && (
        <>
          <ErrorBanner message={error} />
          <SuccessBanner message={notice} />
          <Card>
            <form onSubmit={save} className="space-y-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <input
                  className="input text-sm"
                  placeholder='Day, e.g. "Day 1"'
                  aria-label="Day label"
                  required
                  value={form.day_label}
                  onChange={(e) =>
                    // a known day brings its date with it
                    setForm({ ...form, day_label: e.target.value, date: days[e.target.value] ?? form.date })
                  }
                />
                <input
                  type="date"
                  className="input text-sm"
                  aria-label="Date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
                <input
                  type="time"
                  className="input text-sm"
                  aria-label="Planned start"
                  value={form.start}
                  onChange={(e) => setTimes({ start: e.target.value })}
                />
                <input
                  type="time"
                  className="input text-sm"
                  aria-label="Planned end"
                  value={form.end}
                  onChange={(e) => setTimes({ end: e.target.value })}
                />
              </div>
              <input
                className="input text-sm"
                placeholder="Time as Freshies see it, e.g. 09:00 – 10:30"
                aria-label="Time text"
                required
                value={form.time_label}
                onChange={(e) => setForm({ ...form, time_label: e.target.value })}
              />
              <p className="text-xs text-ink-faint">
                The date is saved for every &ldquo;{form.day_label || "this day"}&rdquo; item
                {days[form.day_label] && form.date !== days[form.day_label] ? " (changing it moves the whole day)" : ""}.
                Planned times feed the Welcome page countdown; the session and the live timer
                are run from Live control.
              </p>
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
        dayLabels.map((day) => (
          <Card key={day} className="p-0">
            <p className="border-b border-paper-200 px-4 py-2.5 font-bold">
              {day}
              {days[day] && (
                <span className="ml-2 text-sm font-semibold text-ink-faint">
                  {new Date(`${days[day]}T00:00`).toLocaleDateString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              )}
            </p>
            <div className="divide-y divide-paper-200">
              {items
                .filter((i) => i.day_label === day)
                .map((i, idx, dayItems) => (
                  <div
                    key={i.id}
                    className={cn(
                      "flex gap-3 px-4 py-3",
                      isAdmin && dragId === i.id && "opacity-40",
                      isAdmin && overId === i.id && dragId !== i.id && "bg-brand-1/10"
                    )}
                    draggable={isAdmin}
                    onDragStart={(e) => {
                      setDragId(i.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      const dragged = items.find((x) => x.id === dragId);
                      if (!isAdmin || !dragged || dragged.day_label !== day) return;
                      e.preventDefault();
                      setOverId(i.id);
                    }}
                    onDragLeave={() => setOverId((o) => (o === i.id ? null : o))}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragId !== null) reorder(day, dragId, idx);
                      setDragId(null);
                      setOverId(null);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                  >
                    {isAdmin && (
                      <div className="flex shrink-0 items-center gap-0.5 text-ink-faint">
                        <GripVertical size={16} className="cursor-grab" aria-hidden />
                        <div className="flex flex-col">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => reorder(day, i.id, idx - 1)}
                            className="disabled:opacity-25"
                            aria-label={`Move ${i.title} up`}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={idx === dayItems.length - 1}
                            onClick={() => reorder(day, i.id, idx + 1)}
                            className="disabled:opacity-25"
                            aria-label={`Move ${i.title} down`}
                          >
                            <ArrowDown size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                    <span className="w-24 shrink-0 text-sm font-semibold tabular-nums text-brand-1">
                      {i.time_label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {i.title}
                        {isAdmin && !i.starts_at && (
                          <span className="ml-2 text-[11px] text-ink-faint">no planned time</span>
                        )}
                      </p>
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
