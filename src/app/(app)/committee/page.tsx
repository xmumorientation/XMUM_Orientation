"use client";

import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";

import { CampusMap } from "@/components/CampusMap";
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
  BlindBoxAllocation,
  Group,
} from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

type OpsView = "map" | "attendance" | "balances" | "register";

interface FreshieHit {
  id: string;
  full_name: string;
  student_id: string | null;
  email: string | null;
  group_id: number | null;
}

// Committee-tier operations: live map (FR-3.4), attendance completion
// (FR-2.3), personal blind-box QR (v2), register counter (FR-12.1).
export default function CommitteePage() {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [groups, setGroups] = useState<Group[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [attendance, setAttendance] = useState<
    Record<number, { present: number; total: number }>
  >({});
  const [allocation, setAllocation] = useState<BlindBoxAllocation | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<FreshieHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<OpsView>("map");

  const canAssign = profile.role === "committee" || profile.role === "admin";

  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: gs }, { data: sess }, { data: alloc }] = await Promise.all([
        supabase.from("groups").select("*").order("id"),
        supabase
          .from("attendance_sessions")
          .select("*")
          .order("id", { ascending: false }),
        supabase
          .from("blind_box_allocations")
          .select("*")
          .eq("profile_id", profile.id)
          .maybeSingle(),
      ]);
      if (!active) return;
      setGroups((gs as Group[]) ?? []);
      setSessions((sess as AttendanceSession[]) ?? []);
      setAllocation((alloc as BlindBoxAllocation) ?? null);
      const open = (sess as AttendanceSession[])?.find((s) => !s.closed);
      setSessionId(open?.id ?? (sess as AttendanceSession[])?.[0]?.id ?? null);
    }
    load();

    const channel = supabase
      .channel(`bb-alloc-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "blind_box_allocations",
          filter: `profile_id=eq.${profile.id}`,
        },
        load
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, profile.id]);

  // render personal blind-box QR from the stored signed token
  useEffect(() => {
    if (!allocation?.qr_token) {
      setQrDataUrl(null);
      return;
    }
    const base =
      process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const url = `${base}/blindbox?t=${encodeURIComponent(allocation.qr_token)}`;
    QRCode.toDataURL(url, { width: 480, margin: 2 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [allocation?.qr_token]);

  // FR-2.3: realtime attendance completion per group.
  // Group head-counts don't change during a session, so fetch them once and
  // cache; realtime events only refetch the (small) records for this session
  // and merge against the cached totals. The subscription is filtered to the
  // active session to avoid a refetch storm across concurrent sessions.
  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    // group_id -> total members, computed once per session.
    let groupTotals: Record<number, number> | null = null;

    async function loadGroupTotals() {
      const { data: members } = await supabase
        .from("profiles")
        .select("group_id")
        .eq("role", "freshie")
        .not("group_id", "is", null);
      const totals: Record<number, number> = {};
      for (const m of members ?? []) {
        const gid = (m as { group_id: number }).group_id;
        totals[gid] = (totals[gid] ?? 0) + 1;
      }
      return totals;
    }

    async function loadAttendance() {
      if (!groupTotals) groupTotals = await loadGroupTotals();
      const { data: recs } = await supabase
        .from("attendance_records")
        .select("group_id, status")
        .eq("session_id", sessionId!);
      if (!active) return;
      const totals: Record<number, { present: number; total: number }> = {};
      for (const [gid, total] of Object.entries(groupTotals)) {
        totals[Number(gid)] = { present: 0, total };
      }
      for (const r of recs ?? []) {
        const rec = r as { group_id: number; status: string };
        totals[rec.group_id] = totals[rec.group_id] ?? { present: 0, total: 0 };
        if (rec.status === "present") totals[rec.group_id].present++;
      }
      setAttendance(totals);
    }
    loadAttendance();

    const channel = supabase
      .channel(`att-dash-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance_records",
          filter: `session_id=eq.${sessionId}`,
        },
        loadAttendance
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, sessionId]);

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
      setNotice("Group assigned. The Freshie's app updates immediately.");
      setHits((h) =>
        h.map((x) => (x.id === freshieId ? { ...x, group_id: groupId } : x))
      );
    }
  }

  const tabs: { key: OpsView; label: string; desc: string }[] = [
    { key: "map", label: "Map", desc: "Live location view" },
    { key: "attendance", label: "Attendance", desc: "Completion by group" },
    { key: "balances", label: "Balances", desc: "Token overview" },
    { key: "register", label: "Register", desc: "Assign freshies" },
  ];

  return (
    <div className="space-y-4">
      <PageTitle title="Operations" subtitle="Live situational awareness" />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <div className="grid grid-cols-2 gap-2 rounded-[1.5rem] bg-paper-200 p-1.5 sm:grid-cols-4">
        {tabs
          .filter((tab) => tab.key !== "register" || canAssign)
          .map((tab) => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={cn(
                "min-h-[64px] rounded-[1.15rem] px-3 text-left transition",
                view === tab.key
                  ? "bg-white text-ink shadow-card"
                  : "text-ink-faint hover:bg-white/50"
              )}
            >
              <span className="block text-sm font-black">{tab.label}</span>
              <span className="mt-1 block text-xs leading-4">{tab.desc}</span>
            </button>
          ))}
      </div>

      {allocation && allocation.active && (
        <Card className="text-center">
          <h2 className="font-semibold">
            My blind box QR
            {allocation.box_type === "special" && (
              <span className="chip ml-2 bg-amber-400/40 text-amber-500">
                special
              </span>
            )}
          </h2>
          <p className="text-sm text-ink-faint">
            {allocation.total_boxes - allocation.used_boxes} of{" "}
            {allocation.total_boxes} boxes left · {allocation.min_tokens}-
            {allocation.max_tokens} tokens each · each group can scan you once
          </p>
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="My blind box QR code"
              className="mx-auto mt-2 w-56 max-w-full rounded-xl border border-paper-200"
            />
          ) : (
            <p className="mt-2 text-sm text-ink-faint">Generating QR…</p>
          )}
          <p className="mt-1 text-xs text-ink-faint">
            Let a Freshie scan this with their phone camera after your mini-game.
          </p>
        </Card>
      )}

      {view === "map" && (
        <section>
          <h2 className="mb-2 font-semibold">Live map</h2>
          <CampusMap showGroupPins />
        </section>
      )}

      {view === "attendance" && (
        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Attendance</h2>
            <select
              className="input max-w-[190px]"
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
          <Card className="divide-y divide-paper-200 p-0">
            {groups.map((g) => {
              const a = attendance[g.id] ?? { present: 0, total: 0 };
              const pct = a.total ? Math.round((a.present / a.total) * 100) : 0;
              return (
                <div key={g.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-20 text-sm font-medium">{g.name}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-paper-200">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        pct === 100 ? "bg-status-open" : "bg-brand-1"
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
      )}

      {view === "balances" && (
        <section>
          <h2 className="mb-2 font-semibold">Group balances</h2>
          <Card className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {groups.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between rounded-xl bg-paper-100 px-3 py-2 text-sm"
              >
                <span>{g.name}</span>
                <span className="font-bold tabular-nums">{g.token_balance} tokens</span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {view === "register" && canAssign && (
        <section>
          <h2 className="mb-2 font-semibold">Register counter</h2>
          <Card className="space-y-3">
            <form onSubmit={search} className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                className="input"
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
                className="flex items-center gap-2 rounded-xl border border-paper-200 px-3 py-2"
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
    </div>
  );
}
