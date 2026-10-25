"use client";

import { useEffect, useMemo, useState } from "react";

import { AuditPills, AuditTable, useAuditLookups, useAuditPage } from "@/components/staff/AuditLog";
import { StatusLine } from "@/components/staff/game/parts";
import { actionsOf, AUDIT_ACTIONS, GAME_KINDS, groupOr, type AuditKind } from "@/lib/auditLog";
import { supabaseBrowser } from "@/lib/supabase/client";

// A group's Recent changes (Ops → Faci & Status, HOF and Admin), in a wide
// sheet: every logged change to the group or by its people, the game
// included, newest first. A row belongs to the group when it names the group
// (in the target or detail.group_id) or was done by one of its accounts (the
// group's Freshie login and its Facilitators).

type View = "all" | "game" | "location" | "headcount" | "facis";

const VIEWS: { key: View; label: string }[] = [
  { key: "all", label: "All" },
  { key: "game", label: "Game" },
  { key: "location", label: "Location" },
  { key: "headcount", label: "Headcount" },
  { key: "facis", label: "Facilitators" },
];

const ALL_KINDS = [...new Set(Object.values(AUDIT_ACTIONS))];

const kindsOf = (view: View): AuditKind[] => (view === "all" ? ALL_KINDS : view === "game" ? GAME_KINDS : [view]);

export function GroupLog({ groupId }: { groupId: number }) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const lookups = useAuditLookups();
  const [view, setView] = useState<View>("all");
  // The group's accounts (its Freshie login and Facilitators); the log waits for them.
  const [accounts, setAccounts] = useState<string[] | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from("profiles").select("id").eq("group_id", groupId);
      if (active) setAccounts(((data as { id: string }[] | null) ?? []).map((r) => r.id));
    })();
    return () => {
      active = false;
    };
  }, [supabase, groupId]);

  const or = accounts?.length ? `${groupOr(groupId)},actor.in.(${accounts.join(",")})` : groupOr(groupId);
  const log = useAuditPage({ actions: actionsOf(kindsOf(view)), or }, accounts !== null);

  return (
    <div className="gc-log-sheet">
      <AuditPills label="What changed" options={VIEWS} value={view} onChange={setView} />
      <StatusLine error={log.error} notice={null} />
      {/* Phones: the table slides sideways inside this box; Time stays put. */}
      <div className="gc-log-wrap gc-log-box">
        {log.rows === null ? (
          <p className="gc-empty">Loading…</p>
        ) : log.rows.length === 0 ? (
          <p className="gc-empty">No changes yet.</p>
        ) : (
          <AuditTable rows={log.rows} names={{ ...lookups, people: log.people }} groupId={groupId} />
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
