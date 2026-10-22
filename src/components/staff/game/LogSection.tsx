"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";

import { AuditPills, AuditTable, useAuditLookups, useAuditPage } from "@/components/staff/AuditLog";
import { actionsOf, GAME_KINDS, groupOr, type AuditKind } from "@/lib/auditLog";
import type { UserRole } from "@/lib/types";

import { StatusLine } from "./parts";

// HOGM's game log: the game rows of audit_log (tokens, stations, puzzles,
// projectors, blind boxes, games and settings), newest first, as a table (the
// shared AuditTable; the words are in lib/auditLog). Only game actions are
// asked for, so account and Faci changes stay on Admin → Audit; that is a page
// filter, the policy still lets HOGM read every row.

const KINDS: { key: AuditKind | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "tokens", label: "Tokens" },
  { key: "stations", label: "Stations" },
  { key: "puzzles", label: "Puzzles" },
  { key: "projectors", label: "Projectors" },
  { key: "blindbox", label: "Blind box" },
  { key: "game", label: "Games & settings" },
];

type Who = "all" | "gm" | "hogm" | "admin" | "groups" | "system";

const WHO: { key: Who; label: string; roles?: UserRole[] }[] = [
  { key: "all", label: "Anyone" },
  { key: "gm", label: "Game Masters", roles: ["gm", "guardian_gm"] },
  { key: "hogm", label: "HOGM", roles: ["hogm"] },
  { key: "admin", label: "Admin", roles: ["admin"] },
  { key: "groups", label: "Groups", roles: ["freshie", "faci"] },
  { key: "system", label: "System" },
];

export function LogSection() {
  const lookups = useAuditLookups();
  const [kind, setKind] = useState<AuditKind | "all">("all");
  const [who, setWho] = useState<Who>("all");
  const [groupId, setGroupId] = useState<number | null>(null);
  const log = useAuditPage({
    actions: actionsOf(kind === "all" ? GAME_KINDS : [kind]),
    roles: who === "system" ? "system" : WHO.find((w) => w.key === who)?.roles,
    or: groupId != null ? groupOr(groupId) : undefined,
  });

  return (
    <div className="gc-stack">
      <StatusLine error={log.error} notice={null} />

      <div className="gc-card gc-log-filters">
        <div className="gc-field">
          <span>What</span>
          <AuditPills label="What happened" options={KINDS} value={kind} onChange={setKind} />
        </div>
        <div className="gc-field">
          <span>Who</span>
          <AuditPills label="Who did it" options={WHO} value={who} onChange={setWho} />
        </div>
        <div className="gc-toolbar">
          <select
            className="gc-input"
            aria-label="Group"
            value={groupId ?? ""}
            onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">All groups</option>
            {Object.entries(lookups.groups).map(([id, g]) => (
              <option key={id} value={id}>
                {g.name}
              </option>
            ))}
          </select>
          <button type="button" className="gc-icon" aria-label="Refresh" disabled={log.loading} onClick={log.refresh}>
            <RefreshCw size={17} aria-hidden />
          </button>
        </div>
      </div>

      {/* Phones: the table slides sideways inside this card; Time stays put. */}
      <div className="gc-card gc-log-wrap">
        {log.rows === null ? (
          <p className="gc-empty">Loading…</p>
        ) : log.rows.length === 0 ? (
          <p className="gc-empty">Nothing here yet.</p>
        ) : (
          <AuditTable rows={log.rows} names={{ ...lookups, people: log.people }} />
        )}
      </div>

      {log.hasMore && (
        <button type="button" className="gc-btn" disabled={log.loading} onClick={log.loadMore}>
          Load more
        </button>
      )}
    </div>
  );
}
