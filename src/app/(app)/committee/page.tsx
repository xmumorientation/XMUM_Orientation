"use client";

import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";

import { CampusMap } from "@/components/CampusMap";
import { useProfile } from "@/components/ProfileProvider";
import {
  Card,
  ErrorBanner,
  PageTitle,
} from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type {
  AttendanceSession,
  BlindBoxAllocation,
  Group,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type OpsView = "map" | "attendance" | "balances";

// Committee-tier operations: live map (FR-3.4), attendance completion
// (FR-2.3), personal blind-box QR (v2), register counter (FR-12.1).
export default function CommitteePage() {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [groups, setGroups] = useState<Group[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [headcounts, setHeadcounts] = useState<Record<number, number>>({});
  const [allocation, setAllocation] = useState<BlindBoxAllocation | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<OpsView>("map");

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

  // Tokens are hash-only in the DB (0007): mint a fresh one on demand via
  // the rotation route and render it once. Explicit button only — rotating
  // on page load would invalidate the QR on every visit and ping-pong with
  // the allocation realtime subscription above.
  async function showMyQr() {
    setQrBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/blindbox/qr", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't generate the QR");
      } else {
        setQrDataUrl(await QRCode.toDataURL(data.url, { width: 480, margin: 2 }));
      }
    } catch (err) {
      setError(String(err));
    }
    setQrBusy(false);
  }

  useEffect(() => {
    if (!sessionId) return;
    let active = true;

    async function loadHeadcounts() {
      const { data } = await supabase
        .from("attendance_headcounts")
        .select("group_id, headcount")
        .eq("session_id", sessionId!);
      if (!active) return;
      const map: Record<number, number> = {};
      for (const row of data ?? []) {
        const rec = row as { group_id: number; headcount: number };
        map[rec.group_id] = rec.headcount;
      }
      setHeadcounts(map);
    }
    loadHeadcounts();

    const channel = supabase
      .channel(`headcount-dash-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance_headcounts",
          filter: `session_id=eq.${sessionId}`,
        },
        loadHeadcounts
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, sessionId]);

  const tabs: { key: OpsView; label: string; desc: string }[] = [
    { key: "map", label: "Map", desc: "Live location view" },
    { key: "attendance", label: "Headcount", desc: "People per group" },
    { key: "balances", label: "Balances", desc: "Token overview" },
  ];

  return (
    <div className="space-y-4">
      <PageTitle title="Operations" subtitle="Live situational awareness" />
      <ErrorBanner message={error} />

      <div className="grid grid-cols-3 gap-2 rounded-[1.5rem] bg-paper-200 p-1.5">
        {tabs.map((tab) => (
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
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="My blind box QR code"
              className="mx-auto mt-2 w-56 max-w-full rounded-xl border border-paper-200"
            />
          )}
          <button
            onClick={showMyQr}
            disabled={qrBusy}
            className="btn-primary mx-auto mt-3"
          >
            {qrBusy ? "Generating…" : qrDataUrl ? "Refresh QR" : "Show my QR"}
          </button>
          <p className="mt-2 text-xs text-ink-faint">
            {qrDataUrl
              ? "Let a Freshie scan this with their phone camera after your mini-game. Generating again invalidates this QR."
              : "Generates a fresh QR each time — any previously shown or printed QR stops working."}
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
            <h2 className="font-semibold">Headcount</h2>
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
              const count = headcounts[g.id];
              return (
                <div key={g.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm font-medium">{g.name}</span>
                  <span className="text-sm font-bold tabular-nums text-ink">
                    {count == null ? "—" : count}
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

    </div>
  );
}
