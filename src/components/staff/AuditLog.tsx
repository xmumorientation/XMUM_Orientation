"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GroupBadge } from "@/components/GroupBadge";
import { auditWhen, describeAudit, namesIn, type AuditLookups, type AuditNames } from "@/lib/auditLog";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ROLE_LABELS, type AuditEntry, type UserRole } from "@/lib/types";
import { friendlyError, timeAgo } from "@/lib/utils";

// The audit log as a table, and its loading, shared by HOGM's game log
// (game/LogSection) and a group's Recent changes (faci/GroupLog). The words
// come from lib/auditLog; the styles are .gc-log in game/game-control.css.
// audit_log is read under 0002's "leads read audit log" (HOF, HOGM, Admin).

const PAGE = 50;

export type AuditFilter = {
  actions: string[];
  /** Only these actor roles; "system" for rows with no actor. */
  roles?: UserRole[] | "system";
  /** A PostgREST `or` filter. */
  or?: string;
};

const EMPTY: AuditLookups = { groups: {}, stations: {}, boxTypes: {}, phases: {}, sessions: {} };

type Named = { id: number; name: string };
const byId = (list: unknown) => Object.fromEntries(((list as Named[] | null) ?? []).map((r) => [r.id, r.name]));

/** Names for the ids rows carry: groups, stations, box types, phases and attendance sessions. Loaded once. */
export function useAuditLookups(): AuditLookups {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [lookups, setLookups] = useState<AuditLookups>(EMPTY);

  useEffect(() => {
    let active = true;
    (async () => {
      const [g, s, t, p, a] = await Promise.all([
        supabase.from("groups").select("id, name, display_name, color").order("id"),
        supabase.from("stations").select("id, name"),
        supabase.from("blind_box_types").select("id, name"),
        supabase.from("phases").select("key, name"),
        supabase.from("attendance_sessions").select("id, name"),
      ]);
      if (!active) return;
      const groups = (g.data as (Named & { display_name: string | null; color: string | null })[] | null) ?? [];
      setLookups({
        groups: Object.fromEntries(groups.map((r) => [r.id, { name: r.display_name?.trim() || r.name, color: r.color }])),
        stations: byId(s.data),
        boxTypes: byId(t.data),
        phases: Object.fromEntries(((p.data as { key: string; name: string }[] | null) ?? []).map((r) => [r.key, r.name])),
        sessions: byId(a.data),
      });
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  return lookups;
}

/**
 * One page of audit rows for a filter, newest first, with the names of the
 * people they mention. A new filter starts again from the first
 * page. Refreshes every 30 s (audit_log is not on realtime). While `ready` is
 * false nothing loads (a page still working out its filter).
 */
export function useAuditPage(filter: AuditFilter, ready = true) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const key = JSON.stringify(filter);
  const [page, setPage] = useState({ key, limit: PAGE });
  const limit = page.key === key ? page.limit : PAGE;
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the latest load may write, so a slow answer for an old filter is dropped.
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!ready) return;
    const f = JSON.parse(key) as AuditFilter;
    const mine = ++seq.current;
    setLoading(true);
    let query = supabase
      .from("audit_log")
      .select("*")
      .in("action", f.actions)
      .order("created_at", { ascending: false })
      // One extra row tells whether there is more.
      .limit(limit + 1);
    if (f.roles === "system") query = query.is("actor_role", null);
    else if (f.roles) query = query.in("actor_role", f.roles);
    if (f.or) query = query.or(f.or);
    const { data, error: err } = await query;
    if (mine !== seq.current) return;
    if (err) {
      setLoading(false);
      setError(friendlyError(err));
      return;
    }
    const list = (data as AuditEntry[]) ?? [];
    const shown = list.slice(0, limit);
    const ids = namesIn(shown);
    const { data: found } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
    if (mine !== seq.current) return;
    setPeople(Object.fromEntries(((found as { id: string; full_name: string | null }[] | null) ?? []).map((r) => [r.id, r.full_name || "Someone"])));
    setRows(shown);
    setHasMore(list.length > limit);
    setError(null);
    setLoading(false);
  }, [supabase, key, limit, ready]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  return {
    rows,
    people,
    hasMore,
    loading,
    error,
    refresh: load,
    loadMore: () => setPage({ key, limit: limit + PAGE }),
  };
}

/** Filter pills: one pressed at a time. */
export function AuditPills<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="gc-pills" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function tokenText(tokens: number | undefined) {
  if (tokens == null) return "";
  if (tokens > 0) return `+${tokens}`;
  return tokens < 0 ? `−${-tokens}` : "0";
}

/**
 * The rows as a table: Time, Who, Object, Action, Tokens, Details. In one
 * group's log (`groupId`) there is no Object column; an object that is not
 * that group moves to the front of Details.
 */
export function AuditTable({ rows, names, groupId }: { rows: AuditEntry[]; names: AuditNames; groupId?: number }) {
  const showObject = groupId == null;
  return (
    <table className="gc-log">
      <thead>
        <tr>
          <th>Time</th>
          <th>Who</th>
          {showObject && <th>Object</th>}
          <th>Action</th>
          <th className="gc-log-tok">Tokens</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const row = describeAudit(r, names);
          const detail = !showObject && row.group !== groupId ? [row.object, row.detail].filter(Boolean).join(" / ") : row.detail;
          return (
            <tr key={r.id}>
              <td className="gc-log-time">
                <time dateTime={r.created_at} title={new Date(r.created_at).toLocaleString()}>
                  {auditWhen(r.created_at)}
                </time>
                <small>{timeAgo(r.created_at)}</small>
              </td>
              <td className="gc-log-who">
                <b>{r.actor ? (names.people[r.actor] ?? "Someone") : "System"}</b>
                {r.actor_role && <small>{ROLE_LABELS[r.actor_role]}</small>}
              </td>
              {showObject && (
                <td className="gc-log-obj">
                  <span>
                    {row.group != null && (
                      <GroupBadge id={row.group} color={names.groups[row.group]?.color} className="h-6 w-6 text-[11px]" />
                    )}
                    {row.object}
                  </span>
                </td>
              )}
              <td className="gc-log-act">{row.action}</td>
              <td className="gc-log-tok" data-sign={row.tokens ? (row.tokens > 0 ? "+" : "-") : undefined}>
                {tokenText(row.tokens)}
              </td>
              <td className="gc-log-detail">{detail}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
