"use client";

import { Check, Clock, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import {
  Card,
  EmptyState,
  ErrorBanner,
  PageTitle,
  Spinner,
} from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type {
  AttendanceSession,
  AttendanceStatus,
  Freshie,
} from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

interface RecordMap {
  [freshieId: string]: AttendanceStatus;
}

// FR-2.1: Faci roster marking per session. FR-2.2: headcount fallback.
export default function AttendancePage() {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [roster, setRoster] = useState<Freshie[]>([]);
  const [records, setRecords] = useState<RecordMap>({});
  const [headcount, setHeadcount] = useState("");
  const [savedHeadcount, setSavedHeadcount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Auto-determine the active/open session
  const activeSession = useMemo(() => {
    return sessions.find((s) => !s.closed) ?? sessions[0] ?? null;
  }, [sessions]);

  const sessionId = activeSession?.id ?? null;

  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: sess }, { data: members }] = await Promise.all([
        supabase
          .from("attendance_sessions")
          .select("*")
          .order("id", { ascending: false }),
        profile.group_id
          ? supabase
              .from("freshies")
              .select("*")
              .eq("group_id", profile.group_id)
              .order("full_name")
          : Promise.resolve({ data: [] }),
      ]);
      if (!active) return;
      setSessions((sess as AttendanceSession[]) ?? []);
      setRoster((members as Freshie[]) ?? []);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [supabase, profile.group_id]);

  useEffect(() => {
    if (!sessionId || !profile.group_id) return;
    let active = true;
    async function loadRecords() {
      const [{ data: recs }, { data: hc }] = await Promise.all([
        supabase
          .from("attendance_records")
          .select("freshie_id, status")
          .eq("session_id", sessionId!)
          .eq("group_id", profile.group_id!),
        supabase
          .from("attendance_headcounts")
          .select("headcount")
          .eq("session_id", sessionId!)
          .eq("group_id", profile.group_id!)
          .maybeSingle(),
      ]);

      if (!active) return;

      const map: RecordMap = {};
      for (const r of recs ?? []) {
        map[String((r as { freshie_id: number }).freshie_id)] = (
          r as { status: AttendanceStatus }
        ).status;
      }
      setRecords(map);

      if (hc) {
        setSavedHeadcount((hc as { headcount: number }).headcount);
        setHeadcount(String((hc as { headcount: number }).headcount));
      } else {
        setSavedHeadcount(null);
        setHeadcount("");
      }
    }
    loadRecords();
    return () => {
      active = false;
    };
  }, [supabase, sessionId, profile.group_id]);

  async function mark(freshieId: number, status: AttendanceStatus) {
    if (!sessionId) return;
    setError(null);
    setSavingId(freshieId);
    const prev = records[freshieId];
    setRecords((r) => ({ ...r, [freshieId]: status })); // optimistic
    const { error } = await supabase.rpc("fn_mark_attendance", {
      p_session_id: sessionId,
      p_freshie_id: freshieId,
      p_status: status,
    });
    if (error) {
      setRecords((r) => ({ ...r, [freshieId]: prev }));
      setError(friendlyError(error));
    }
    setSavingId(null);
  }

  async function markAllPresent() {
    if (!sessionId || !profile.group_id) return;
    setError(null);
    setBulkLoading(true);

    const { error } = await supabase.rpc("fn_bulk_mark_present", {
      p_session_id: sessionId,
      p_group_id: profile.group_id,
    });

    if (error) {
      setError(friendlyError(error));
    } else {
      const updatedMap: RecordMap = {};
      roster.forEach((f) => {
        updatedMap[f.id] = "present";
      });
      setRecords(updatedMap);
    }
    setBulkLoading(false);
  }

  async function submitHeadcount(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId) return;
    setError(null);
    const countVal = parseInt(headcount, 10);
    const { error } = await supabase.rpc("fn_record_headcount", {
      p_session_id: sessionId,
      p_count: countVal,
    });
    if (error) {
      setError(friendlyError(error));
    } else {
      setSavedHeadcount(countVal);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const presentCount = Object.values(records).filter((s) => s === "present").length;
  const lateCount = Object.values(records).filter((s) => s === "late").length;
  const absentCount = Object.values(records).filter((s) => s === "absent").length;

  return (
    <div className="space-y-4">
      <PageTitle title="Attendance" subtitle="Mark your group per session" />
      <ErrorBanner message={error} />

      {activeSession ? (
        <Card className="bg-paper-50 border border-paper-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-xs text-ink-faint uppercase font-bold tracking-wider">Active Session</p>
              <h3 className="text-lg font-bold text-ink">{activeSession.name}</h3>
              {(activeSession.starts_at || activeSession.ends_at) && (
                <p className="text-xs text-ink-soft mt-0.5">
                  {activeSession.starts_at && `Starts: ${new Date(activeSession.starts_at).toLocaleTimeString()} `}
                  {activeSession.ends_at && `Ends: ${new Date(activeSession.ends_at).toLocaleTimeString()}`}
                </p>
              )}
            </div>
            <div>
              <span
                className={cn(
                  "chip text-xs",
                  activeSession.closed
                    ? "bg-red-100 text-red-800"
                    : "bg-green-100 text-green-800"
                )}
              >
                {activeSession.closed ? "Closed" : "Open"}
              </span>
            </div>
          </div>
          {activeSession.closed && (
            <p className="mt-2 text-xs text-red-600 font-medium">
              This session is closed — records are locked (contact Admin for corrections).
            </p>
          )}
        </Card>
      ) : (
        <Card className="border border-amber-200 bg-amber-50 text-amber-800">
          <p className="text-sm font-semibold">No Sessions Available</p>
        </Card>
      )}

      {roster.length === 0 ? (
        <EmptyState message="No Freshies assigned to your group yet." />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-paper-200 bg-paper-50 px-4 py-3 text-sm text-ink-soft gap-2">
            <div>
              <span className="font-semibold text-ink">{roster.length}</span> Freshies &middot;{" "}
              <span className="text-green-600 font-medium">{presentCount} present</span>,{" "}
              <span className="text-amber-600 font-medium">{lateCount} late</span>,{" "}
              <span className="text-red-600 font-medium">{absentCount} absent</span>
            </div>
            <button
              onClick={markAllPresent}
              disabled={bulkLoading || activeSession?.closed}
              className="btn-secondary text-xs py-1 px-3 self-start sm:self-auto"
            >
              {bulkLoading ? "Marking..." : "Mark All Present"}
            </button>
          </div>
          <ul className="divide-y divide-paper-200">
            {roster.map((f) => {
              const status = records[f.id];
              return (
                <li key={f.id} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-paper-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {f.full_name}
                    </p>
                    <p className="text-xs text-ink-faint tabular-nums">{f.student_id}</p>
                  </div>
                  {savingId === f.id ? (
                    <div className="w-[180px] flex justify-center">
                      <Spinner className="h-4 w-4" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => mark(f.id, "present")}
                        disabled={activeSession?.closed}
                        aria-label={`Mark ${f.full_name ?? f.student_id} present`}
                        className={cn(
                          "btn p-2 rounded-lg transition-all border",
                          status === "present"
                            ? "bg-green-600 border-green-600 text-white shadow-sm"
                            : "border-paper-300 bg-white text-ink-soft hover:bg-paper-50"
                        )}
                      >
                        <Check size={18} />
                      </button>
                      <button
                        onClick={() => mark(f.id, "late")}
                        disabled={activeSession?.closed}
                        aria-label={`Mark ${f.full_name ?? f.student_id} late`}
                        className={cn(
                          "btn p-2 rounded-lg transition-all border",
                          status === "late"
                            ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                            : "border-paper-300 bg-white text-ink-soft hover:bg-paper-50"
                        )}
                      >
                        <Clock size={18} />
                      </button>
                      <button
                        onClick={() => mark(f.id, "absent")}
                        disabled={activeSession?.closed}
                        aria-label={`Mark ${f.full_name ?? f.student_id} absent`}
                        className={cn(
                          "btn p-2 rounded-lg transition-all border",
                          status === "absent"
                            ? "bg-red-600 border-red-600 text-white shadow-sm"
                            : "border-paper-300 bg-white text-ink-soft hover:bg-paper-50"
                        )}
                      >
                        <X size={18} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {profile.group_id && activeSession && (
        <Card>
          <h2 className="mb-1 font-semibold">Headcount fallback</h2>
          <p className="mb-3 text-xs text-ink-faint">
            When individual marking is impractical, record a quick headcount instead.
          </p>
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
            <button
              type="submit"
              disabled={activeSession?.closed}
              className="btn-secondary px-5"
            >
              Save
            </button>
          </form>
          {savedHeadcount !== null && (
            <p className="mt-2 text-xs text-ink-soft">
              Currently recorded headcount fallback: <span className="font-semibold text-ink">{savedHeadcount}</span>
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
