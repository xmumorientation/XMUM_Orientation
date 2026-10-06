"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Card, ErrorBanner, PageTitle, Spinner, SuccessBanner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { AttendanceSession, Group } from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

type Headcount = { session_id: number; group_id: number; headcount: number };

const OTHER = "Other";

// Which day a session belongs to: its start date matched to the Schedule's
// day dates, else "Day N" in its name, else Other.
function sessionDay(s: AttendanceSession, dayByDate: Record<string, string>) {
  if (s.starts_at) {
    const d = new Date(s.starts_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (dayByDate[key]) return dayByDate[key];
  }
  const m = s.name.match(/day\s*(\d+)/i);
  return m ? `Day ${m[1]}` : OTHER;
}

function without<T extends Record<string, unknown>>(obj: T, key: string): T {
  const next = { ...obj };
  delete next[key];
  return next;
}

// All headcounts at a glance: one row per group, one column per attendance
// session (opened and closed in Live control). Filter by day or session.
// Cells can be corrected in place; Faci headcounts arrive live.
export default function HeadcountPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({}); // "session:group" → headcount
  const [dayByDate, setDayByDate] = useState<Record<string, string>>({});
  const [dayFilter, setDayFilter] = useState("all");
  const [sessionFilter, setSessionFilter] = useState("all");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: sess }, { data: grps }, { data: hcs }, { data: days }] = await Promise.all([
      supabase.from("attendance_sessions").select("*").order("starts_at", { nullsFirst: false }).order("id"),
      supabase.from("groups").select("*").order("id"),
      supabase.from("attendance_headcounts").select("session_id, group_id, headcount"),
      supabase.from("schedule_days").select("day_label, day_date"),
    ]);
    setSessions((sess as AttendanceSession[]) ?? []);
    setGroups((grps as Group[]) ?? []);
    setCounts(
      Object.fromEntries(((hcs as Headcount[]) ?? []).map((h) => [`${h.session_id}:${h.group_id}`, h.headcount]))
    );
    setDayByDate(Object.fromEntries((days ?? []).map((d) => [d.day_date as string, d.day_label as string])));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("admin-headcount")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_sessions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_headcounts" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, supabase]);

  const withDay = sessions.map((s) => ({ ...s, day: sessionDay(s, dayByDate) }));
  const dayOptions = [...new Set(withDay.map((s) => s.day))].sort((a, b) =>
    a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b, undefined, { numeric: true })
  );
  const inDay = withDay.filter((s) => dayFilter === "all" || s.day === dayFilter);
  const shown = inDay.filter((s) => sessionFilter === "all" || String(s.id) === sessionFilter);

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

  return (
    <div className="space-y-4">
      <PageTitle title="Headcount" subtitle="Every group's headcount for every session" />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      {sessions.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-faint">
            No sessions yet. Open a session on a schedule item in Live control.
          </p>
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
                setSessionFilter("all");
              }}
            >
              <option value="all">All days</option>
              {dayOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              aria-label="Session"
              className="input w-auto max-w-[320px]"
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
            >
              <option value="all">All sessions{dayFilter === "all" ? "" : ` on ${dayFilter}`}</option>
              {inDay.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.closed ? " (closed)" : " (open)"}
                </option>
              ))}
            </select>
            <span className="text-xs text-ink-faint">Click a number to correct it; Enter saves, Esc cancels.</span>
          </div>

          {shown.length === 0 ? (
            <Card>
              <p className="text-sm text-ink-faint">No sessions for this filter.</p>
            </Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-paper-200 text-xs font-bold text-ink-faint">
                    <th className="px-4 py-3">Group</th>
                    {shown.map((s) => (
                      <th key={s.id} className="min-w-[8rem] px-3 py-3 align-bottom">
                        <span className="block text-ink">{s.name}</span>
                        <span
                          className={cn(
                            "mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide",
                            s.closed ? "bg-gray-200 text-gray-600" : "bg-green-100 text-green-800"
                          )}
                        >
                          {s.day} · {s.closed ? "closed" : "open"}
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
                      {shown.map((s) => {
                        const key = `${s.id}:${g.id}`;
                        const value = drafts[key] ?? (counts[key] !== undefined ? String(counts[key]) : "");
                        return (
                          <td key={s.id} className="px-3 py-1.5">
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              aria-label={`${g.name} headcount, ${s.name}`}
                              placeholder="—"
                              disabled={savingKey === key}
                              className={cn(
                                "input min-h-[36px] w-20 text-sm tabular-nums",
                                drafts[key] !== undefined && "ring-2 ring-amber-400"
                              )}
                              value={value}
                              onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                              onBlur={() => save(s.id, g.id)}
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
                    {shown.map((s) => {
                      const reported = groups.filter((g) => counts[`${s.id}:${g.id}`] !== undefined);
                      const total = reported.reduce((sum, g) => sum + counts[`${s.id}:${g.id}`], 0);
                      return (
                        <td key={s.id} className="px-3 py-3">
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
