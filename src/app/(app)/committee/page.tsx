"use client";

import { useEffect, useMemo, useState } from "react";

import { CampusMap } from "@/components/CampusMap";
import { GachaReveal } from "@/components/GachaReveal";
import { useProfile } from "@/components/ProfileProvider";
import {
  Card,
  ErrorBanner,
  PageTitle,
  SuccessBanner,
} from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type {
  AttendanceSession,
  GachaResult,
  Group,
} from "@/lib/types";
import { cn, friendlyError, idemKey } from "@/lib/utils";

interface FreshieHit {
  id: string;
  full_name: string;
  student_id: string | null;
  email: string | null;
  group_id: number | null;
}

// Committee-tier operations: live map (FR-3.4), attendance completion
// (FR-2.3), Idea 1 special draw (HOF/HOGM), register counter (FR-12.1).
export default function CommitteePage() {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [groups, setGroups] = useState<Group[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [attendance, setAttendance] = useState<
    Record<number, { present: number; total: number }>
  >({});
  const [drawGroup, setDrawGroup] = useState<number | null>(null);
  const [gacha, setGacha] = useState<GachaResult | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<FreshieHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canDraw = profile.role === "hof" || profile.role === "hogm";
  const canAssign = profile.role === "committee" || profile.role === "admin";

  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: gs }, { data: sess }] = await Promise.all([
        supabase.from("groups").select("*").order("id"),
        supabase
          .from("attendance_sessions")
          .select("*")
          .order("id", { ascending: false }),
      ]);
      if (!active) return;
      setGroups((gs as Group[]) ?? []);
      setSessions((sess as AttendanceSession[]) ?? []);
      const open = (sess as AttendanceSession[])?.find((s) => !s.closed);
      setSessionId(open?.id ?? (sess as AttendanceSession[])?.[0]?.id ?? null);
    }
    load();
    return () => {
      active = false;
    };
  }, [supabase]);

  // FR-2.3: realtime attendance completion per group
  useEffect(() => {
    if (!sessionId) return;
    let active = true;

    async function loadAttendance() {
      const [{ data: recs }, { data: members }] = await Promise.all([
        supabase
          .from("attendance_records")
          .select("group_id, status")
          .eq("session_id", sessionId!),
        supabase
          .from("profiles")
          .select("group_id")
          .eq("role", "freshie")
          .not("group_id", "is", null),
      ]);
      if (!active) return;
      const totals: Record<number, { present: number; total: number }> = {};
      for (const m of members ?? []) {
        const gid = (m as { group_id: number }).group_id;
        totals[gid] = totals[gid] ?? { present: 0, total: 0 };
        totals[gid].total++;
      }
      for (const r of recs ?? []) {
        const rec = r as { group_id: number; status: string };
        totals[rec.group_id] = totals[rec.group_id] ?? {
          present: 0,
          total: 0,
        };
        if (rec.status === "present") totals[rec.group_id].present++;
      }
      setAttendance(totals);
    }
    loadAttendance();

    const channel = supabase
      .channel(`att-dash-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_records" },
        loadAttendance
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, sessionId]);

  async function specialDraw() {
    if (!drawGroup) {
      setError("Select a group first.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("fn_gacha_draw", {
      p_group_id: drawGroup,
      p_pool_key: "idea1",
      p_idempotency_key: idemKey(),
    });
    setBusy(false);
    if (error) setError(friendlyError(error));
    else setGacha(data as GachaResult);
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { data, error } = await supabase.rpc("fn_lookup_freshie", {
      p_query: query,
    });
    if (error) setError(friendlyError(error));
    else setHits((data as FreshieHit[]) ?? []);
  }

  async function assign(freshieId: string, groupId: number) {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("fn_assign_group", {
      p_user_id: freshieId,
      p_group_id: groupId,
    });
    setBusy(false);
    if (error) setError(friendlyError(error));
    else {
      setNotice("Group assigned — the Freshie's app updates immediately.");
      setHits((h) =>
        h.map((x) => (x.id === freshieId ? { ...x, group_id: groupId } : x))
      );
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Operations" subtitle="Live situational awareness" />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <section>
        <h2 className="mb-2 font-semibold">Live map — all groups</h2>
        <CampusMap showGroupPins />
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Attendance</h2>
          <select
            className="input max-w-[180px]"
            value={sessionId ?? ""}
            onChange={(e) => setSessionId(Number(e.target.value))}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <Card className="divide-y divide-base-200 p-0">
          {groups.map((g) => {
            const a = attendance[g.id] ?? { present: 0, total: 0 };
            const pct = a.total ? Math.round((a.present / a.total) * 100) : 0;
            return (
              <div key={g.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-20 text-sm font-medium">{g.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-base-200">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      pct === 100 ? "bg-status-open" : "bg-star-cyan"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-16 text-right text-xs tabular-nums text-ink-faint">
                  {a.present}/{a.total}
                </span>
              </div>
            );
          })}
        </Card>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Group balances</h2>
        <Card className="grid grid-cols-2 gap-2">
          {groups.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between rounded-lg bg-base-100 px-3 py-1.5 text-sm"
            >
              <span>{g.name}</span>
              <span className="font-bold tabular-nums">{g.token_balance} ✦</span>
            </div>
          ))}
        </Card>
      </section>

      {canDraw && (
        <section>
          <h2 className="mb-2 font-semibold">
            Bankruptcy Protection draw (Idea 1)
          </h2>
          <Card className="space-y-2">
            <p className="text-sm text-ink-faint">
              +2 tokens and one facility card from the remaining pool of 10.
            </p>
            <select
              className="input"
              value={drawGroup ?? ""}
              onChange={(e) => setDrawGroup(Number(e.target.value) || null)}
            >
              <option value="">Select group…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button
              disabled={busy}
              onClick={specialDraw}
              className="btn-primary w-full"
            >
              🎁 Trigger special draw
            </button>
          </Card>
        </section>
      )}

      {canAssign && (
        <section>
          <h2 className="mb-2 font-semibold">Register counter (FR-12.1)</h2>
          <Card className="space-y-3">
            <form onSubmit={search} className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Student ID or name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" className="btn-secondary">
                Search
              </button>
            </form>
            {hits.map((h) => (
              <div
                key={h.id}
                className="flex items-center gap-2 rounded-xl border border-base-200 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{h.full_name}</p>
                  <p className="text-xs text-ink-faint">
                    {h.student_id} ·{" "}
                    {h.group_id ? `Group ${h.group_id}` : "no group"}
                  </p>
                </div>
                <select
                  className="input max-w-[130px]"
                  value={h.group_id ?? ""}
                  onChange={(e) => assign(h.id, Number(e.target.value))}
                  disabled={busy}
                >
                  <option value="">Assign…</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </Card>
        </section>
      )}

      {gacha && <GachaReveal result={gacha} onClose={() => setGacha(null)} />}
    </div>
  );
}
