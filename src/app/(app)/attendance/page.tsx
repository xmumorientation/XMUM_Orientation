"use client";

import { useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { Card, ErrorBanner, PageTitle, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { AttendanceSession } from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

export default function AttendancePage() {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [headcount, setHeadcount] = useState("");
  const [savedHeadcount, setSavedHeadcount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const activeSession = useMemo(() => {
    return sessions.find((s) => !s.closed) ?? sessions[0] ?? null;
  }, [sessions]);

  const sessionId = activeSession?.id ?? null;

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: sess } = await supabase
        .from("attendance_sessions")
        .select("*")
        .order("id", { ascending: false });
      if (!active) return;
      setSessions((sess as AttendanceSession[]) ?? []);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!sessionId || !profile.group_id) return;
    let active = true;
    async function loadHeadcount() {
      const { data: hc } = await supabase
        .from("attendance_headcounts")
        .select("headcount")
        .eq("session_id", sessionId!)
        .eq("group_id", profile.group_id!)
        .maybeSingle();
      if (!active) return;
      if (hc) {
        setSavedHeadcount((hc as { headcount: number }).headcount);
        setHeadcount(String((hc as { headcount: number }).headcount));
      } else {
        setSavedHeadcount(null);
        setHeadcount("");
      }
    }
    loadHeadcount();
    return () => {
      active = false;
    };
  }, [supabase, sessionId, profile.group_id]);

  async function submitHeadcount(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId) return;
    setError(null);
    const countVal = parseInt(headcount, 10);
    const { error: rpcError } = await supabase.rpc("fn_record_headcount", {
      p_session_id: sessionId,
      p_count: countVal,
    });
    if (rpcError) setError(friendlyError(rpcError));
    else setSavedHeadcount(countVal);
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
      <PageTitle title="Attendance" subtitle="How many people are in your group" />
      <ErrorBanner message={error} />

      {activeSession ? (
        <Card className="border border-paper-200 bg-paper-50">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-faint">Active session</p>
              <h3 className="text-lg font-bold text-ink">{activeSession.name}</h3>
            </div>
            <span
              className={cn(
                "chip text-xs",
                activeSession.closed ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
              )}
            >
              {activeSession.closed ? "Closed" : "Open"}
            </span>
          </div>
          {activeSession.closed && (
            <p className="mt-2 text-xs font-medium text-red-600">
              This session is closed. Ask an admin if the number needs a correction.
            </p>
          )}
        </Card>
      ) : (
        <Card className="border border-amber-200 bg-amber-50 text-amber-800">
          <p className="text-sm font-semibold">No sessions yet</p>
        </Card>
      )}

      {profile.group_id && activeSession && (
        <Card>
          <h2 className="mb-1 font-semibold">Group headcount</h2>
          <p className="mb-3 text-xs text-ink-faint">Enter the number of people with your group for this session.</p>
          <form onSubmit={submitHeadcount} className="flex gap-2">
            <input
              type="number"
              min="0"
              required
              className="input flex-1"
              placeholder="e.g. 24"
              value={headcount}
              onChange={(e) => setHeadcount(e.target.value)}
            />
            <button type="submit" disabled={activeSession.closed} className="btn-secondary px-5">
              Save
            </button>
          </form>
          {savedHeadcount !== null && (
            <p className="mt-2 text-xs text-ink-soft">
              Saved headcount: <span className="font-semibold text-ink">{savedHeadcount}</span>
            </p>
          )}
        </Card>
      )}

      {!profile.group_id && (
        <Card>
          <p className="text-sm text-ink-faint">Your account is not in a group, so there is no headcount to record.</p>
        </Card>
      )}
    </div>
  );
}
