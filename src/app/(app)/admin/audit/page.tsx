"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FilterChips } from "@/components/admin/FilterChips";
import { useAuditLookups } from "@/components/staff/AuditLog";
import { auditSentence, describeAudit, namesIn } from "@/lib/auditLog";
import { Card, PageTitle, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ROLE_LABELS, type AuditEntry } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

// First part of an action name: "tokens.add" -> "tokens".
const prefixOf = (action: string) => action.split(".")[0];

// FR-11.4: global audit log, filterable by action type / actor role / free text.
export default function AdminAuditPage() {
  const PAGE_SIZE = 200;
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [action, setAction] = useState("");
  const [role, setRole] = useState("all");
  const [prefixes, setPrefixes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      // Fetch one extra row to detect whether more history exists.
      .limit(limit + 1);
    if (action) query = query.ilike("action", `%${action}%`);
    if (role === "system") query = query.is("actor_role", null);
    else if (role !== "all") query = query.eq("actor_role", role);
    const { data } = await query;
    const rows = (data as AuditEntry[]) ?? [];
    setHasMore(rows.length > limit);
    setEntries(rows.slice(0, limit));
    // Remember every action type seen so the chips stay while filtering.
    setPrefixes((prev) =>
      [...new Set([...prev, ...rows.map((r) => prefixOf(r.action))])].sort()
    );
    setLoading(false);
  }, [supabase, action, role, limit]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset the window when a filter changes so results start from the top.
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [action, role]);

  // Display only: names for the sentences (read-only lookups; the audit query above is unchanged).
  const lookups = useAuditLookups();
  const [people, setPeople] = useState<Record<string, string>>({});
  useEffect(() => {
    const ids = namesIn(entries);
    if (ids.length === 0) return;
    let active = true;
    supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids)
      .then(({ data }) => {
        if (!active) return;
        setPeople(Object.fromEntries(((data as { id: string; full_name: string | null }[] | null) ?? []).map((r) => [r.id, r.full_name || "Someone"])));
      });
    return () => {
      active = false;
    };
  }, [entries, supabase]);

  const activePrefix = prefixes.find((p) => action === `${p}.`) ?? (action ? "custom" : "all");
  const typeOptions = [
    { value: "all", label: "All Actions" },
    ...prefixes.map((p) => ({ value: p, label: p })),
  ];
  const roleOptions = [
    { value: "all", label: "Anyone" },
    { value: "system", label: "System" },
    ...Object.entries(ROLE_LABELS)
      .filter(([r]) => r !== "freshie")
      .map(([r, label]) => ({ value: r, label })),
  ];

  return (
    <div className="space-y-4">
      <PageTitle title="Audit Log" subtitle="Every state change, attributed (NFR-7)" />

      <Card className="space-y-3">
        <div className="space-y-1.5">
          <p className="av-eyebrow">Action</p>
          <FilterChips
            label="Filter by action type"
            options={typeOptions}
            value={activePrefix === "custom" ? "" : activePrefix}
            onChange={(v) => setAction(v === "all" ? "" : `${v}.`)}
          />
        </div>
        <div className="space-y-1.5">
          <p className="av-eyebrow">Who</p>
          <FilterChips
            label="Filter by role"
            options={roleOptions}
            value={role}
            onChange={setRole}
          />
        </div>
        <label htmlFor="audit-search" className="av-eyebrow block">Search by action</label>
        <input
          id="audit-search"
          className="input"
          placeholder="Or type part of an action (e.g. tokens., blindbox., projector.)…"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
      </Card>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <Card className="av-audit p-0">
          <table className="av-audit-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>What happened</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const name = e.actor ? people[e.actor] : undefined;
                return (
                  <tr key={e.id}>
                    <td data-label="When" className="av-when" title={new Date(e.created_at).toLocaleString()}>
                      {timeAgo(e.created_at)}
                    </td>
                    <td data-label="Who">
                      {e.actor_role ? `${ROLE_LABELS[e.actor_role]}${name ? ` ${name}` : ""}` : "System"}
                    </td>
                    <td data-label="What happened">
                      <p className="av-sentence">{auditSentence(describeAudit(e, { ...lookups, people }), e)}</p>
                      {Object.keys(e.detail ?? {}).length > 0 && (
                        <details>
                          <summary>View details</summary>
                          <pre>{JSON.stringify(e.detail, null, 1)}</pre>
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={3} className="av-empty">
                    No entries match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
      {!loading && hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => setLimit((l) => l + PAGE_SIZE)}
            className="btn-secondary"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
