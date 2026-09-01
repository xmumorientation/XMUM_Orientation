"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Card, ErrorBanner, PageTitle, SuccessBanner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { AttendanceSession } from "@/lib/types";
import { cn } from "@/lib/utils";

// FR-2.1: sessions are named time blocks created by Admin.
// FR-2.4: closing a session locks its records.
export default function AdminSessionsPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("attendance_sessions")
      .select("*")
      .order("id", { ascending: false });
    setSessions((data as AttendanceSession[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase
      .from("attendance_sessions")
      .insert({
        name,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      });
    if (error) setError(error.message);
    else {
      setName("");
      setStartsAt("");
      setEndsAt("");
      setNotice("Session created.");
      setTimeout(() => setNotice(null), 2000);
      load();
    }
  }

  async function toggleClosed(s: AttendanceSession) {
    const { error } = await supabase
      .from("attendance_sessions")
      .update({ closed: !s.closed })
      .eq("id", s.id);
    if (error) setError(error.message);
    else load();
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Attendance sessions"
        subtitle="Closing a session locks its records (FR-2.4)"
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <Card>
        <form onSubmit={create} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="label" htmlFor="session-name">Session name</label>
              <input
                id="session-name"
                className="input w-full"
                placeholder='e.g. "Day 1 AM"'
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="session-start">Start time (optional)</label>
              <input
                id="session-start"
                type="datetime-local"
                className="input w-full"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="session-end">End time (optional)</label>
              <input
                id="session-end"
                type="datetime-local"
                className="input w-full"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="btn-primary px-6">
              + Create Session
            </button>
          </div>
        </form>
      </Card>

      <Card className="divide-y divide-paper-200 p-0">
        {sessions.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1">
              <p className="text-sm font-semibold">{s.name}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-0.5 text-xs text-ink-faint">
                <span>{s.closed ? "Closed - records locked" : "Open"}</span>
                {s.starts_at && (
                  <span>
                    Starts: {new Date(s.starts_at).toLocaleString()}
                  </span>
                )}
                {s.ends_at && (
                  <span>
                    Ends: {new Date(s.ends_at).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => toggleClosed(s)}
              className={cn(
                "btn min-w-[90px] text-sm",
                s.closed
                  ? "border border-paper-300 bg-white"
                  : "bg-ink text-white"
              )}
            >
              {s.closed ? "Reopen" : "Close"}
            </button>
          </div>
        ))}
        {sessions.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-ink-faint">
            No sessions yet.
          </p>
        )}
      </Card>
    </div>
  );
}
