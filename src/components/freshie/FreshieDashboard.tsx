"use client";

import {
  ArrowUpRight,
  Clock,
  Coins,
  Layers,
  PhoneCall,
  QrCode,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import { useProfile } from "@/components/ProfileProvider";
import { useGroup } from "@/components/useGroup";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  PIECES_PER_SET,
  PROJECTOR_LOCATIONS,
  type InventoryEntry,
  type ProjectorLocation,
} from "@/lib/types";
import { formatCountdown } from "@/lib/utils";

const GROUP_ACCENTS = [
  { hex: "#0dfcfd", name: "Cyan" },
  { hex: "#d966ff", name: "Purple" },
  { hex: "#ff3cac", name: "Magenta" },
  { hex: "#39ff14", name: "Green" },
  { hex: "#f9d342", name: "Yellow" },
  { hex: "#ff6b35", name: "Orange" },
] as const;

function getGroupColor(groupId: number | null | undefined) {
  if (!groupId || groupId < 1) return GROUP_ACCENTS[0];
  return GROUP_ACCENTS[(groupId - 1) % GROUP_ACCENTS.length];
}

/** Checkpoint QR Dialog */
function CheckpointDialog({
  groupName,
  groupId,
  fullName,
  studentId,
  colorHex,
}: {
  groupName: string;
  groupId: number | null;
  fullName: string;
  studentId: string | null;
  colorHex: string;
}) {
  const [qrUrl, setQrUrl] = useState<string>("");

  useEffect(() => {
    const payload = JSON.stringify({
      app: "xmum-orientation-2026",
      gid: groupId,
      sid: studentId,
      name: fullName,
      ts: Date.now(),
    });

    QRCode.toDataURL(payload, {
      width: 240,
      margin: 1,
      color: { dark: "#07060b", light: "#ffffff" },
    })
      .then(setQrUrl)
      .catch(() => {});
  }, [groupId, studentId, fullName]);

  return (
    <div className="fd-qr-modal-body">
      <div className="fd-qr-frame" style={{ borderColor: colorHex }}>
        {qrUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrUrl}
            alt="Checkpoint QR"
            className="fd-qr-img"
            width={220}
            height={220}
          />
        ) : (
          <div className="fd-qr-loading">Generating QR…</div>
        )}
      </div>

      <div className="fd-qr-meta">
        <div className="flex items-center justify-between border-b border-[var(--an-line)] pb-2 text-sm">
          <span className="text-[var(--an-mute)]">Group</span>
          <span className="font-bold text-[var(--an-text)]">{groupName}</span>
        </div>
        <div className="flex items-center justify-between pt-2 text-sm">
          <span className="text-[var(--an-mute)]">Student</span>
          <span className="font-semibold text-[var(--an-text)]">
            {fullName} {studentId ? `(${studentId})` : ""}
          </span>
        </div>
      </div>

      <p className="fd-qr-tip">
        Show this QR code at station checkpoints for quick check-in.
      </p>
    </div>
  );
}

/** 1. Clean Freshie Pass Card (No duplicate Group 1, no AI jargon) */
function FreshiePassCard({
  groupName,
  groupId,
  fullName,
  studentId,
  loading,
  colorHex,
  colorName,
}: {
  groupName: string;
  groupId: number | null;
  fullName: string;
  studentId: string | null;
  loading: boolean;
  colorHex: string;
  colorName: string;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setCoords({ x, y });
  }, []);

  const handlePointerLeave = useCallback(() => {
    setCoords(null);
  }, []);

  return (
    <section
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="fd-pass-card"
      style={
        {
          "--fd-accent": colorHex,
          "--pass-x": coords ? `${coords.x}%` : "50%",
          "--pass-y": coords ? `${coords.y}%` : "50%",
          "--pass-opacity": coords ? "1" : "0",
        } as React.CSSProperties
      }
    >
      <div className="fd-pass-inner">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--an-line)] pb-3">
          <div className="min-w-0">
            <p className="text-xs text-[var(--an-mute)]">Welcome to Orientation</p>
            <h1 className="text-lg font-bold text-[var(--an-text)] truncate">
              {fullName || "Freshie"}
            </h1>
          </div>

          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="fd-pass-qr-btn"
                aria-label="Show check-in QR code"
                title="Show Checkpoint Pass"
              >
                <QrCode size={18} strokeWidth={1.75} />
              </button>
            </DialogTrigger>
            <DialogContent
              title="Station Check-in Pass"
              description="Show this QR to your Facilitator or Game Master at checkpoints."
              className="fd-checkpoint-dialog"
            >
              <CheckpointDialog
                groupName={groupName}
                groupId={groupId}
                fullName={fullName}
                studentId={studentId}
                colorHex={colorHex}
              />
            </DialogContent>
          </Dialog>
        </div>

        <div className="pt-3 flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: colorHex }}
              />
              <span className="text-xl font-extrabold text-[var(--an-text)]">
                {loading ? "Loading…" : groupName}
              </span>
            </div>
            <p className="text-xs text-[var(--an-mute)] mt-1">
              {groupId
                ? `Wristband: ${colorName}`
                : "Get your wristband at the registration desk"}
            </p>
          </div>

          {studentId && (
            <span className="font-mono text-xs text-[var(--an-mute)] bg-[var(--an-ink-3)] px-2 py-1 rounded-md border border-[var(--an-line)]">
              {studentId}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

/** 2. Current Phase Card */
function PhaseCard() {
  const { phases, offsetMs, tick } = usePhaseTimer();
  void tick;

  const active = phases.find((p) => p.state === "active");
  const paused = phases.find((p) => p.state === "paused");
  const current = active ?? paused;

  if (!current) {
    return (
      <section className="fd-card-clean">
        <div className="flex items-center justify-between text-xs text-[var(--an-mute)]">
          <span className="font-semibold uppercase tracking-wider">Current Phase</span>
          <span>Standby</span>
        </div>
        <p className="text-base font-bold text-[var(--an-text)] mt-1">
          Orientation Starting Soon
        </p>
        <p className="text-xs text-[var(--an-text-2)] mt-1">
          Stay with your group in the Main Hall. Announcements will appear here.
        </p>
      </section>
    );
  }

  const serverNow = Date.now() + offsetMs;
  const remaining =
    current.state === "paused"
      ? (current.paused_remaining ?? 0)
      : current.ends_at
        ? (new Date(current.ends_at).getTime() - serverNow) / 1000
        : 0;

  const isEndgame = current.is_endgame;

  return (
    <section className={`fd-card-clean ${isEndgame ? "border-red-500/40" : ""}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold uppercase tracking-wider text-[var(--an-mute)]">
          Current Phase
        </span>
        <span
          className={`font-semibold px-2 py-0.5 rounded-full text-[11px] ${
            isEndgame
              ? "bg-red-500/20 text-red-300 border border-red-500/40"
              : current.state === "active"
                ? "bg-green-500/20 text-green-300 border border-green-500/40"
                : "bg-gray-500/20 text-gray-300"
          }`}
        >
          {current.state === "paused" ? "Paused" : isEndgame ? "Final Stage" : "Live"}
        </span>
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-[var(--an-text)] leading-snug">
          {current.name}
        </h2>
        <div className="flex items-center gap-1 font-mono text-sm font-bold text-[var(--an-yellow)] shrink-0">
          <Clock size={14} strokeWidth={1.75} />
          <span className="tabular-nums">
            {current.state === "paused"
              ? `paused · ${formatCountdown(remaining)}`
              : formatCountdown(remaining)}
          </span>
        </div>
      </div>
    </section>
  );
}

/** 3. Tokens & Puzzles Progress */
function ScoreAndProgress({
  group,
  loading,
  groupId,
}: {
  group: { id: number; name: string; token_balance: number } | null;
  loading: boolean;
  groupId: number | null;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [entries, setEntries] = useState<InventoryEntry[]>([]);

  useEffect(() => {
    if (!groupId) return;
    let active = true;

    async function load() {
      const { data } = await supabase
        .from("inventory")
        .select("*, items(*)")
        .eq("group_id", groupId!)
        .order("created_at", { ascending: false });
      if (active && data) {
        setEntries(data as InventoryEntry[]);
      }
    }
    load();

    const channel = supabase
      .channel(`freshie-inventory-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inventory",
          filter: `group_id=eq.${groupId}`,
        },
        load
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, groupId]);

  const countByLoc = useMemo(() => {
    const map: Record<ProjectorLocation, number> = { B1: 0, A3: 0, TF: 0 };
    for (const loc of PROJECTOR_LOCATIONS) {
      map[loc] = entries.filter(
        (e) => e.items?.type === "puzzle" && e.items?.puzzle_location === loc
      ).length;
    }
    return map;
  }, [entries]);

  const totalPieces = entries.filter((e) => e.items?.type === "puzzle").length;
  const anyComplete = PROJECTOR_LOCATIONS.some((loc) => countByLoc[loc] >= PIECES_PER_SET);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* Tokens Card */}
      <Link
        href="/transactions"
        className="fd-card-clean hover:border-[var(--an-cyan)] transition flex flex-col justify-between"
      >
        <div className="flex items-center justify-between text-xs text-[var(--an-mute)]">
          <div className="flex items-center gap-1.5 font-semibold">
            <Coins size={15} strokeWidth={1.75} className="text-[var(--an-yellow)]" />
            <span>Group Tokens</span>
          </div>
          <ArrowUpRight size={14} strokeWidth={1.75} className="fd-card-arrow" />
        </div>

        <div className="my-2">
          <span className="text-3xl font-extrabold text-[var(--an-text)] tabular-nums">
            {loading ? "…" : group ? group.token_balance : 0}
          </span>
          <span className="text-xs font-semibold text-[var(--an-mute)] ml-1.5">tokens</span>
        </div>

        <p className="text-xs text-[var(--an-mute)] border-t border-[var(--an-line)] pt-2">
          View token history →
        </p>
      </Link>

      {/* Blueprints / Puzzles Card */}
      <Link
        href="/inventory"
        className="fd-card-clean hover:border-[var(--an-cyan)] transition flex flex-col justify-between"
      >
        <div className="flex items-center justify-between text-xs text-[var(--an-mute)]">
          <div className="flex items-center gap-1.5 font-semibold">
            <Layers size={15} strokeWidth={1.75} className="text-[var(--an-cyan)]" />
            <span>Puzzle Pieces</span>
          </div>
          <div className="flex items-center gap-1 font-mono text-xs font-bold text-[var(--an-text)]">
            <span>
              {totalPieces} / {PROJECTOR_LOCATIONS.length * PIECES_PER_SET}
            </span>
            <ArrowUpRight size={14} strokeWidth={1.75} className="fd-card-arrow" />
          </div>
        </div>

        <div className="my-2 space-y-1.5">
          {PROJECTOR_LOCATIONS.map((loc) => {
            const count = countByLoc[loc] || 0;
            const isDone = count >= PIECES_PER_SET;
            return (
              <div key={loc} className="flex items-center justify-between text-xs">
                <span className="font-mono font-medium text-[var(--an-mute)] w-6">{loc}</span>
                <div className="flex-1 mx-2 flex gap-1 h-1.5">
                  {Array.from({ length: PIECES_PER_SET }).map((_, i) => (
                    <span
                      key={i}
                      className={`flex-1 rounded-sm ${
                        i < count
                          ? isDone
                            ? "bg-[var(--an-yellow)]"
                            : "bg-[var(--an-cyan)]"
                          : "bg-[var(--an-ink-3)] border border-[var(--an-line)]"
                      }`}
                    />
                  ))}
                </div>
                <span className="font-mono text-[11px] text-[var(--an-mute)] w-6 text-right">
                  {count}/5
                </span>
              </div>
            );
          })}
        </div>

        {anyComplete && (
          <div className="flex items-center gap-1 text-[11px] font-bold text-[var(--an-yellow)] mb-1">
            <Sparkles size={12} strokeWidth={2} />
            <span>A set is complete! Find Guardian to verify.</span>
          </div>
        )}

        <p className="text-xs text-[var(--an-mute)] border-t border-[var(--an-line)] pt-2">
          View puzzle boards →
        </p>
      </Link>
    </div>
  );
}

/** 4. Campus Help & Safety Notice */
function CampusHelpNotice() {
  return (
    <section className="fd-card-clean text-xs text-[var(--an-text-2)] flex items-start gap-2.5">
      <ShieldAlert size={16} strokeWidth={1.75} className="text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-semibold text-[var(--an-text)]">Need Help During Orientation?</p>
        <p className="text-[var(--an-mute)] mt-0.5">
          First Aid & Information Desk located at Ground Floor, Main Hall.
        </p>
      </div>
      <Link
        href="/faq"
        className="shrink-0 inline-flex items-center gap-1 text-[var(--an-yellow)] font-semibold hover:underline active:scale-95 transition-transform"
      >
        <PhoneCall size={12} strokeWidth={1.75} />
        <span>FAQ</span>
      </Link>
    </section>
  );
}

/** Master Freshie Dashboard */
export function FreshieDashboard() {
  const profile = useProfile();
  const { group, loading } = useGroup();
  const colorInfo = getGroupColor(group?.id ?? profile.group_id);

  return (
    <div className="fd-hub">
      {/* 1. Clean Pass Card */}
      <FreshiePassCard
        groupName={group ? group.name : "No Group Assigned"}
        groupId={group ? group.id : profile.group_id}
        fullName={profile.full_name || ""}
        studentId={profile.student_id}
        loading={loading}
        colorHex={colorInfo.hex}
        colorName={colorInfo.name}
      />

      {/* 2. Current Phase */}
      <PhaseCard />

      {/* 3. Team Tokens & Puzzles */}
      <ScoreAndProgress
        group={group}
        loading={loading}
        groupId={group ? group.id : profile.group_id}
      />

      {/* 4. Help & Safety Notice */}
      <CampusHelpNotice />
    </div>
  );
}
