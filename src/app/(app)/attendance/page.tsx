"use client";

import { Check, X } from "lucide-react";
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
  Profile,
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
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [roster, setRoster] = useState<Profile[]>([]);
  const [records, setRecords] = useState<RecordMap>({});
  const [headcount, setHeadcount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

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
              .from("profiles")
              .select("*")
              .eq("group_id", profile.group_id)
              .eq("role", "freshie")
              .order("full_name")
          : Promise.resolve({ data: [] }),
      ]);
      if (!active) return;
      setSessions((sess as AttendanceSession[]) ?? []);
      setRoster((members as Profile[]) ?? []);
      const open = (sess as AttendanceSession[])?.find((s) => !s.closed);
      setSessionId(open?.id ?? (sess as AttendanceSession[])?.[0]?.id ?? null);
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
      const { data } = await supabase
        .from("attendance_records")
        .select("freshie_id, status")
        .eq("session_id", sessionId!)
        .eq("group_id", profile.group_id!);
      if (!active) return;
      const map: RecordMap = {};
      for (const r of data ?? []) {
        map[(r as { freshie_id: string }).freshie_id] = (
          r as { status: AttendanceStatus }
        ).status;
      }
      setRecords(map);
    }
    loadRecords();
    return () => {
      active = false;
    };
  }, [supabase, sessionId, profile.group_id]);

  const session = sessions.find((s) => s.id === sessionId) ?? null;

  async function mark(freshieId: string, status: AttendanceStatus) {
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

  async function submitHeadcount(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId) return;
    setError(null);
    const { error } = await supabase.rpc("fn_record_headcount", {
      p_session_id: sessionId,
      p_count: parseInt(headcount, 10),
    });
    if (error) setError(friendlyError(error));
    else setHeadcount("");
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const presentCount = Object.values(records).filter(
    (s) => s === "present"
  ).length;

  return (
    <div className="space-y-4">
      <PageTitle title="Attendance" subtitle="Mark your group per session" />
      <ErrorBanner message={error} />

      <Card>
        <label className="label" htmlFor="session">
          Session
        </label>
        <select
          id="session"
          className="input"
          value={sessionId ?? ""}
          onChange={(e) => setSessionId(Number(e.target.value))}
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.closed ? " (closed)" : ""}
            </option>
          ))}
        </select>
        {session?.closed && (
          <p className="mt-2 text-sm text-red-600">
            This session is closed — records are locked (contact Admin for
            corrections).
          </p>
        )}
      </Card>

      {roster.length === 0 ? (
        <EmptyState message="No Freshies assigned to your group yet." />
      ) : (
        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-paper-200 px-4 py-2 text-sm text-ink-faint">
            <span>{roster.length} Freshies</span>
            <span>
              {presentCount} marked present
            </span>
          </div>
          <ul className="divide-y divide-paper-200">
            {roster.map((f) => {
              const status = records[f.id];
              return (
                <li key={f.id} className="flex items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {f.full_name}
                    </p>
                    <p className="text-xs text-ink-faint">{f.student_id}</p>
                  </div>
                  {savingId === f.id ? (
                    <Spinner />
                  ) : (
                    <>
                      <button
                        onClick={() => mark(f.id, "present")}
                        disabled={session?.closed}
                        aria-label={`Mark ${f.full_name ?? f.student_id} present`}
                        className={cn(
                          "btn min-w-[64px] text-sm",
                          status === "present"
                            ? "bg-green-600 text-white"
                            : "border border-paper-300 bg-white text-ink-soft"
                        )}
                      >
                        <Check size={20} strokeWidth={1.75} />
                      </button>
                      <button
                        onClick={() => mark(f.id, "absent")}
                        disabled={session?.closed}
                        aria-label={`Mark ${f.full_name ?? f.student_id} absent`}
                        className={cn(
                          "btn min-w-[64px] text-sm",
                          status === "absent"
                            ? "bg-red-600 text-white"
                            : "border border-paper-300 bg-white text-ink-soft"
                        )}
                      >
                        <X size={20} strokeWidth={1.75} />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 font-semibold">Headcount fallback</h2>
        <p className="mb-2 text-sm text-ink-faint">
          When individual marking is impractical, record a quick headcount
          instead.
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
            disabled={session?.closed}
            className="btn-secondary"
          >
            Save
          </button>
        </form>
      </Card>
    </div>
  );
}
