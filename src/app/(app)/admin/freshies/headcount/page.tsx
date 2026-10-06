"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Card, ErrorBanner, PageTitle, Spinner, SuccessBanner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { AttendanceSession, Group, ScheduleItem } from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

type Headcount = { session_id: number; group_id: number; headcount: number };
type ItemRow = Pick<ScheduleItem, "id" | "day_label" | "title" | "time_label" | "starts_at" | "session_id">;

// A column: a Live schedule item (its session may not be opened yet), or an
// old session that is not on the schedule.
interface Column {
  key: string;
  day: string;
  title: string;
  time: string | null;
  sessionId: number | null;
  status: "not_opened" | "open" | "closed";
}

const OFF_SCHEDULE = "Not on schedule";

function clock(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
    : null;
}

function without<T extends Record<string, unknown>>(obj: T, key: string): T {
  const next = { ...obj };
  delete next[key];
  return next;
}

// All headcounts at a glance: one row per group, one column per Live
// schedule item, in schedule order. A column takes headcounts once its
// session has been opened in Live control. Old sessions that are not on the
// schedule sit under "Not on schedule". Filter by day or item; cells can be
// corrected in place; sessions and Faci headcounts arrive live.
export default function HeadcountPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({}); // "session:group" → headcount
  const [dayFilter, setDayFilter] = useState("all");
  const [columnFilter, setColumnFilter] = useState("all");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: sess }, { data: grps }, { data: hcs }, { data: its }] = await Promise.all([
      supabase.from("attendance_sessions").select("*").order("id"),
      supabase.from("groups").select("*").order("id"),
      supabase.from("attendance_headcounts").select("session_id, group_id, headcount"),
      supabase
        .from("schedule_items")
        .select("id, day_label, title, time_label, starts_at, session_id")
        .order("day_label")
        .order("sort_order")
        .order("id"),
    ]);
    setSessions((sess as AttendanceSession[]) ?? []);
    setGroups((grps as Group[]) ?? []);
    setItems((its as ItemRow[]) ?? []);
    setCounts(
      Object.fromEntries(((hcs as Headcount[]) ?? []).map((h) => [`${h.session_id}:${h.group_id}`, h.headcount]))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("admin-headcount")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_sessions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_headcounts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_items" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, supabase]);

  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const statusOf = (id: number | null): Column["status"] => {
    const s = id == null ? undefined : sessionById.get(id);
    return !s ? "not_opened" : s.closed ? "closed" : "open";
  };
  const linked = new Set(items.map((i) => i.session_id).filter((id): id is number => id != null));
  const columns: Column[] = [
    ...items.map((i) => ({
      key: `item-${i.id}`,
      day: i.day_label,
      title: i.title,
      time: i.starts_at ? clock(i.starts_at) : i.time_label,
      sessionId: i.session_id,
      status: statusOf(i.session_id),
    })),
    ...sessions
      .filter((s) => !linked.has(s.id))
      .map((s) => ({
        key: `session-${s.id}`,
        day: OFF_SCHEDULE,
        title: s.name,
        time: null,
        sessionId: s.id,
        status: statusOf(s.id),
      })),
  ];
  const dayOptions = [...new Set(columns.map((c) => c.day))];
  // "All schedule days" is the Live schedule; old sessions only under their own filter.
  const inDay = columns.filter((c) => (dayFilter === "all" ? c.day !== OFF_SCHEDULE : c.day === dayFilter));
  const shown = inDay.filter((c) => columnFilter === "all" || c.key === columnFilter);

  async function save(sessionId: number, groupId: number) {
    const key = `${sessionId}:${groupId}`;
    const raw = drafts[key];
    if (raw === undefined) return;
    const value = parseInt(raw, 10);
    if (raw === "" || Number.isNaN(value) || value < 0 || value === counts[key]) {
      setDrafts((d) => without(d, key));
      return;
    }
    setSavingKey(key);
    setError(null);
    const { error: rpcError } = await supabase.rpc("fn_record_headcount", {
      p_session_id: sessionId,
      p_count: value,
      p_group_id: groupId,
    });
    setSavingKey(null);
    if (rpcError) return setError(friendlyError(rpcError));
    setCounts((c) => ({ ...c, [key]: value }));
    setDrafts((d) => without(d, key));
    setNotice(`${groups.find((g) => g.id === groupId)?.name ?? "Group"}: ${value} saved.`);
    setTimeout(() => setNotice(null), 2500);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const statusChip = (c: Column) =>
    c.status === "open"
      ? "bg-green-100 text-green-800"
      : c.status === "closed"
        ? "bg-gray-200 text-gray-600"
        : "bg-paper-200 text-ink-faint";
  const statusText = (c: Column) => (c.status === "not_opened" ? "not opened" : c.status);

  return (
    <div className="space-y-4">
      <PageTitle title="Headcount" subtitle="Every group's headcount for each Live schedule session" />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      {columns.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-faint">No schedule items yet. Add them on the Schedule page.</p>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Day"
              className="input w-auto"
              value={dayFilter}
              onChange={(e) => {
                setDayFilter(e.target.value);
                setColumnFilter("all");
              }}
            >
              <option value="all">All schedule days</option>
              {dayOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              aria-label="Session"
              className="input w-auto max-w-[340px]"
              value={columnFilter}
              onChange={(e) => setColumnFilter(e.target.value)}
            >
              <option value="all">{dayFilter === "all" ? "All items" : `All ${dayFilter} items`}</option>
              {inDay.map((c) => (
                <option key={c.key} value={c.key}>
                  {dayFilter === "all" ? `${c.day} · ` : ""}
                  {c.title} ({statusText(c)})
                </option>
              ))}
            </select>
            <span className="text-xs text-ink-faint">
              Open a session in Live control to take its headcount. Click a number to correct it; Enter saves.
            </span>
          </div>

          {shown.length === 0 ? (
            <Card>
              <p className="text-sm text-ink-faint">Nothing for this filter.</p>
            </Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-paper-200 text-xs font-bold text-ink-faint">
                    <th className="px-4 py-3">Group</th>
                    {shown.map((c) => (
                      <th key={c.key} className="min-w-[8.5rem] px-3 py-3 align-bottom">
                        {c.time && <span className="block font-mono text-[11px] text-brand-1">{c.time}</span>}
                        <span className="block text-ink">{c.title}</span>
                        <span
                          className={cn(
                            "mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide",
                            statusChip(c)
                          )}
                        >
                          {c.day} · {statusText(c)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-paper-200">
                  {groups.map((g) => (
                    <tr key={g.id}>
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2 whitespace-nowrap font-medium">
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ background: g.color || "#008CFF" }}
                            aria-hidden
                          />
                          {g.name}
                        </span>
                      </td>
                      {shown.map((c) => {
                        if (c.sessionId == null || c.status === "not_opened") {
                          return (
                            <td key={c.key} className="px-3 py-1.5 text-ink-faint">
                              —
                            </td>
                          );
                        }
                        const sid = c.sessionId;
                        const key = `${sid}:${g.id}`;
                        const value = drafts[key] ?? (counts[key] !== undefined ? String(counts[key]) : "");
                        return (
                          <td key={c.key} className="px-3 py-1.5">
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              aria-label={`${g.name} headcount, ${c.title}`}
                              placeholder="—"
                              disabled={savingKey === key}
                              className={cn(
                                "input min-h-[36px] w-20 text-sm tabular-nums",
                                drafts[key] !== undefined && "ring-2 ring-amber-400"
                              )}
                              value={value}
                              onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                              onBlur={() => save(sid, g.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                if (e.key === "Escape") setDrafts((d) => without(d, key));
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-paper-300 font-bold">
                    <td className="px-4 py-3">Total</td>
                    {shown.map((c) => {
                      if (c.status === "not_opened") {
                        return (
                          <td key={c.key} className="px-3 py-3 text-xs font-normal text-ink-faint">
                            Not opened
                          </td>
                        );
                      }
                      const reported = groups.filter((g) => counts[`${c.sessionId}:${g.id}`] !== undefined);
                      const total = reported.reduce((sum, g) => sum + counts[`${c.sessionId}:${g.id}`], 0);
                      return (
                        <td key={c.key} className="px-3 py-3">
                          <span className="block tabular-nums">{total}</span>
                          <span className="text-[11px] font-normal text-ink-faint">
                            {reported.length}/{groups.length} groups
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
