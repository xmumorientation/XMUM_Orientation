"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Card, ErrorBanner, PageTitle, Spinner, SuccessBanner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { AttendanceSession, Group } from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

export default function HeadcountPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState<Record<number, number>>({});
  const savedRef = useRef<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  // Follow the newest open session until the admin picks one by hand.
  const pickedByHand = useRef(false);

  // Sessions are opened and closed in Live control; follow them live.
  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: sess }, { data: grps }] = await Promise.all([
        supabase.from("attendance_sessions").select("*").order("id", { ascending: false }),
        supabase.from("groups").select("*").order("id"),
      ]);
      if (!active) return;
      const sessionsList = (sess as AttendanceSession[]) ?? [];
      setSessions(sessionsList);
      setGroups((grps as Group[]) ?? []);
      if (!pickedByHand.current) {
        const open = sessionsList.find((s) => !s.closed);
        setSessionId(open?.id ?? sessionsList[0]?.id ?? null);
      }
      setLoading(false);
    }
    load();
    const channel = supabase
      .channel("admin-headcount-sessions")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_sessions" }, load)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    async function loadCounts() {
      const { data } = await supabase
        .from("attendance_headcounts")
        .select("group_id, headcount")
        .eq("session_id", sessionId!);
      if (!active) return;
      const nextSaved: Record<number, number> = {};
      const nextCounts: Record<number, string> = {};
      for (const row of data ?? []) {
        const rec = row as { group_id: number; headcount: number };
        nextSaved[rec.group_id] = rec.headcount;
        nextCounts[rec.group_id] = String(rec.headcount);
      }
      setSaved(nextSaved);
      // keep what the admin is typing; take the latest for everything else
      setCounts((cur) => {
        const merged = { ...nextCounts };
        for (const [id, val] of Object.entries(cur)) {
          const gid = Number(id);
          if (val !== "" && val !== String(savedRef.current[gid] ?? "")) merged[gid] = val;
        }
        return merged;
      });
      savedRef.current = nextSaved;
    }
    loadCounts();
    // Faci headcounts (and other admins) show up live.
    const channel = supabase
      .channel(`admin-headcount-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_headcounts", filter: `session_id=eq.${sessionId}` },
        loadCounts
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, sessionId]);

  const activeSession = sessions.find((s) => s.id === sessionId) ?? null;

  async function save(groupId: number) {
    if (!sessionId) return;
    const countVal = parseInt(counts[groupId] ?? "", 10);
    if (Number.isNaN(countVal) || countVal < 0) return;
    setSavingId(groupId);
    setError(null);
    const { error: rpcError } = await supabase.rpc("fn_record_headcount", {
      p_session_id: sessionId,
      p_count: countVal,
      p_group_id: groupId,
    });
    setSavingId(null);
    if (rpcError) {
      setError(friendlyError(rpcError));
      return;
    }
    setSaved((s) => ({ ...s, [groupId]: countVal }));
    savedRef.current = { ...savedRef.current, [groupId]: countVal };
    setNotice(`${groups.find((g) => g.id === groupId)?.name ?? "Group"} headcount saved.`);
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
      <PageTitle title="Headcount" subtitle="Record how many people are in each group" />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      {sessions.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-faint">Create an attendance session first.</p>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-semibold" htmlFor="headcount-session">
              Session
            </label>
            <select
              id="headcount-session"
              className="input max-w-[220px]"
              value={sessionId ?? ""}
              onChange={(e) => {
                pickedByHand.current = true;
                setSessionId(Number(e.target.value));
              }}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.closed ? " (closed)" : " (open)"}
                </option>
              ))}
            </select>
          </div>

          <Card className="divide-y divide-paper-200 p-0">
            {groups.map((g) => (
              <form
                key={g.id}
                className="flex items-center gap-3 px-4 py-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  save(g.id);
                }}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: g.color || "#008CFF" }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.name}</span>
                <input
                  type="number"
                  min={0}
                  required
                  aria-label={`${g.name} headcount`}
                  className="input w-24"
                  value={counts[g.id] ?? ""}
                  onChange={(e) => setCounts((c) => ({ ...c, [g.id]: e.target.value }))}
                />
                <button type="submit" className="btn-secondary px-4" disabled={savingId === g.id}>
                  {savingId === g.id ? "Saving" : saved[g.id] != null ? "Update" : "Save"}
                </button>
              </form>
            ))}
          </Card>

          {activeSession?.closed && (
            <p className={cn("text-xs text-ink-faint")}>
              This session is closed. Saving still updates the headcount and writes an audit entry.
            </p>
          )}
        </>
      )}
    </div>
  );
}
