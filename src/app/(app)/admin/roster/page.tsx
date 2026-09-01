"use client";

import { Check, Clock, Download, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  Card,
  EmptyState,
  ErrorBanner,
  PageTitle,
  Spinner,
  SuccessBanner,
} from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type {
  AttendanceSession,
  AttendanceStatus,
  Group,
  Freshie,
} from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

interface RecordMap {
  [freshieId: string]: AttendanceStatus;
}

export default function AdminRosterPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null);
  const [roster, setRoster] = useState<Freshie[]>([]);
  const [records, setRecords] = useState<RecordMap>({});
  const [headcount, setHeadcount] = useState("");
  const [savedHeadcount, setSavedHeadcount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // 1. Initial Load: sessions and groups
  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: sess }, { data: grps }] = await Promise.all([
        supabase
          .from("attendance_sessions")
          .select("*")
          .order("id", { ascending: false }),
        supabase
          .from("groups")
          .select("*")
          .order("name"),
      ]);

      if (!active) return;

      const sessionsList = (sess as AttendanceSession[]) ?? [];
      setSessions(sessionsList);
      setGroups((grps as Group[]) ?? []);

      // Auto-determine active session: the one that is NOT closed, or fallback to the latest
      const open = sessionsList.find((s) => !s.closed);
      setActiveSession(open ?? sessionsList[0] ?? null);

      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [supabase]);

  // 2. Load group roster, attendance records, and headcount fallback
  useEffect(() => {
    if (!activeSession || !groupId) {
      setRoster([]);
      setRecords({});
      setHeadcount("");
      setSavedHeadcount(null);
      return;
    }

    const currentSessionId = activeSession.id;
    let active = true;
    async function loadGroupData() {
      const [{ data: members }, { data: recs }, { data: hc }] = await Promise.all([
        supabase
          .from("freshies")
          .select("*")
          .eq("group_id", groupId!)
          .order("full_name"),
        supabase
          .from("attendance_records")
          .select("freshie_id, status")
          .eq("session_id", currentSessionId)
          .eq("group_id", groupId!),
        supabase
          .from("attendance_headcounts")
          .select("headcount")
          .eq("session_id", currentSessionId)
          .eq("group_id", groupId!)
          .maybeSingle(),
      ]);

      if (!active) return;

      setRoster((members as Freshie[]) ?? []);

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

    loadGroupData();
    return () => {
      active = false;
    };
  }, [supabase, activeSession, groupId]);

  // 3. Mark individual attendance
  async function mark(freshieId: number, status: AttendanceStatus) {
    if (!activeSession || !groupId) return;
    const sessId = activeSession.id;
    const isClosed = activeSession.closed;
    setError(null);
    setSavingId(freshieId);
    const prev = records[freshieId];
    setRecords((r) => ({ ...r, [freshieId]: status })); // optimistic update

    const { error } = await supabase.rpc("fn_mark_attendance", {
      p_session_id: sessId,
      p_freshie_id: freshieId,
      p_status: status,
    });

    if (error) {
      setRecords((r) => ({ ...r, [freshieId]: prev }));
      setError(friendlyError(error));
    } else {
      if (isClosed) {
        showTemporaryNotice("Change recorded in audit log.");
      }
    }
    setSavingId(null);
  }

  // 4. Bulk action: Mark All Present
  async function markAllPresent() {
    if (!activeSession || !groupId) return;
    setError(null);
    setBulkLoading(true);

    const { error } = await supabase.rpc("fn_bulk_mark_present", {
      p_session_id: activeSession.id,
      p_group_id: groupId,
    });

    if (error) {
      setError(friendlyError(error));
    } else {
      const updatedMap: RecordMap = {};
      roster.forEach((f) => {
        updatedMap[f.id] = "present";
      });
      setRecords(updatedMap);
      showTemporaryNotice(
        activeSession.closed
          ? "All marked present (audited)."
          : "All marked present."
      );
    }
    setBulkLoading(false);
  }

  // 5. Submit Headcount Fallback
  async function submitHeadcount(e: React.FormEvent) {
    e.preventDefault();
    if (!activeSession || !groupId) return;
    setError(null);

    const countVal = parseInt(headcount, 10);
    const { error } = await supabase.rpc("fn_record_headcount", {
      p_session_id: activeSession.id,
      p_count: countVal,
      p_group_id: groupId,
    });

    if (error) {
      setError(friendlyError(error));
    } else {
      setSavedHeadcount(countVal);
      showTemporaryNotice("Headcount fallback saved successfully.");
    }
  }

  function showTemporaryNotice(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  }

  // 6. Generate and Export CSV Report
  async function exportReport() {
    setExporting(true);
    setError(null);

    try {
      const [{ data: allSess }, { data: allFreshies }, { data: allRecords }, { data: allHeadcounts }] = await Promise.all([
        supabase.from("attendance_sessions").select("*").order("id"),
        supabase.from("freshies").select("id, group_id, full_name"),
        supabase.from("attendance_records").select("session_id, group_id, freshie_id, status"),
        supabase.from("attendance_headcounts").select("session_id, group_id, headcount"),
      ]);

      const sessList = (allSess as AttendanceSession[]) ?? [];
      const freshies = (allFreshies as Freshie[]) ?? [];
      const recs = (allRecords as { session_id: number; group_id: number; freshie_id: number; status: AttendanceStatus }[]) ?? [];
      const headcounts = (allHeadcounts as { session_id: number; group_id: number; headcount: number }[]) ?? [];

      // Calculate stats per group per session
      const csvLines = [
        "Group,Session,Total Freshies,Present,Late,Absent,Unmarked,Headcount Fallback,Attendance Rate (%)"
      ];

      for (const g of groups) {
        const groupFreshies = freshies.filter((f) => f.group_id === g.id);
        const totalInGroup = groupFreshies.length;

        // 6a. Add records for each session
        let totalPresentAllSess = 0;
        let totalLateAllSess = 0;
        let totalAbsentAllSess = 0;
        let totalSessionsCount = 0;

        for (const s of sessList) {
          const sessionRecs = recs.filter((r) => r.session_id === s.id && r.group_id === g.id);
          const present = sessionRecs.filter((r) => r.status === "present").length;
          const late = sessionRecs.filter((r) => r.status === "late").length;
          const absent = sessionRecs.filter((r) => r.status === "absent").length;
          const unmarked = totalInGroup - sessionRecs.length;

          totalPresentAllSess += present;
          totalLateAllSess += late;
          totalAbsentAllSess += absent;
          totalSessionsCount++;

          const hcVal = headcounts.find((h) => h.session_id === s.id && h.group_id === g.id)?.headcount ?? "";

          // Present + Late count as attended
          const attended = present + late;
          const rate = totalInGroup > 0 ? Math.round((attended / totalInGroup) * 100) : 0;

          csvLines.push(
            `"${g.name}","${s.name}",${totalInGroup},${present},${late},${absent},${unmarked},${hcVal},${rate}%`
          );
        }

        // 6b. Add overall row for this group
        const overallTotalOpportunities = totalInGroup * totalSessionsCount;
        const overallAttended = totalPresentAllSess + totalLateAllSess;
        const overallRate = overallTotalOpportunities > 0 
          ? Math.round((overallAttended / overallTotalOpportunities) * 100) 
          : 0;

        csvLines.push(
          `"${g.name}","OVERALL",${totalInGroup},${totalPresentAllSess},${totalLateAllSess},${totalAbsentAllSess},-,,-,${overallRate}%`
        );
      }

      // Create downloadable file
      const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `attendance_report_${new Date().toISOString().split("T")[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showTemporaryNotice("CSV exported successfully.");
    } catch (err) {
      setError("Failed to export report: " + friendlyError(err));
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  // Derived counts
  const presentCount = Object.values(records).filter((s) => s === "present").length;
  const lateCount = Object.values(records).filter((s) => s === "late").length;
  const absentCount = Object.values(records).filter((s) => s === "absent").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle
          title="Attendance Roster"
          subtitle="Take attendance and record headcount fallbacks across all groups"
        />
        <button
          onClick={exportReport}
          disabled={exporting}
          className="btn-secondary self-start sm:self-auto flex items-center gap-1.5"
        >
          <Download size={18} />
          {exporting ? "Exporting..." : "Export CSV Report"}
        </button>
      </div>

      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

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
                {activeSession.closed ? "Closed (Audited Edits)" : "Open"}
              </span>
            </div>
          </div>
          {activeSession.closed && (
            <p className="mt-2 text-xs text-red-600 font-medium">
              Notice: This session is closed. Edits by Admin are allowed but will be recorded in the audit trail.
            </p>
          )}
        </Card>
      ) : (
        <Card className="border border-amber-200 bg-amber-50 text-amber-800">
          <p className="text-sm font-semibold">No Sessions Available</p>
          <p className="text-xs mt-0.5">
            Please create an attendance session first in the &quot;Sessions&quot; tab.
          </p>
        </Card>
      )}

      <Card>
        <label className="label" htmlFor="group">
          Select Freshie Group
        </label>
        <select
          id="group"
          className="input w-full"
          value={groupId ?? ""}
          onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">-- Choose a Group --</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Card>

      {groupId && activeSession && (
        <>
          {roster.length === 0 ? (
            <EmptyState message="No Freshies assigned to this group yet." />
          ) : (
            <Card className="p-0 overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-paper-200 bg-paper-50 px-4 py-3 gap-2">
                <div className="text-sm text-ink-soft">
                  <span className="font-semibold text-ink">{roster.length}</span> Freshies &middot;{" "}
                  <span className="text-green-600 font-medium">{presentCount} present</span>,{" "}
                  <span className="text-amber-600 font-medium">{lateCount} late</span>,{" "}
                  <span className="text-red-600 font-medium">{absentCount} absent</span>
                </div>
                <button
                  onClick={markAllPresent}
                  disabled={bulkLoading}
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
                        <p className="text-xs text-ink-faint tabular-nums">
                          {f.student_id || "No ID"}
                        </p>
                      </div>
                      {savingId === f.id ? (
                        <div className="w-[180px] flex justify-center">
                          <Spinner className="h-4 w-4" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => mark(f.id, "present")}
                            aria-label={`Mark ${f.full_name} present`}
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
                            aria-label={`Mark ${f.full_name} late`}
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
                            aria-label={`Mark ${f.full_name} absent`}
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

          <Card>
            <h3 className="text-sm font-semibold text-ink">Headcount fallback</h3>
            <p className="text-xs text-ink-faint mb-3">
              When individual marking is impractical, record a quick headcount tally instead.
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
              <button type="submit" className="btn-secondary px-5">
                Save
              </button>
            </form>
            {savedHeadcount !== null && (
              <p className="mt-2 text-xs text-ink-soft">
                Currently recorded headcount fallback: <span className="font-semibold text-ink">{savedHeadcount}</span>
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
