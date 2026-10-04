"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FilterChips } from "@/components/admin/FilterChips";
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

  const activePrefix = prefixes.find((p) => action === `${p}.`) ?? (action ? "custom" : "all");
  const typeOptions = [
    { value: "all", label: "All actions" },
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
      <PageTitle title="Audit log" subtitle="Every state change, attributed (NFR-7)" />

      <Card className="space-y-3">
        <div className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">Action</p>
          <FilterChips
            label="Filter by action type"
            options={typeOptions}
            value={activePrefix === "custom" ? "" : activePrefix}
            onChange={(v) => setAction(v === "all" ? "" : `${v}.`)}
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">Who</p>
          <FilterChips
            label="Filter by role"
            options={roleOptions}
            value={role}
            onChange={setRole}
          />
        </div>
        <input
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
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-paper-200 text-xs font-bold uppercase tracking-wide text-ink-faint">
                <th className="w-32 px-4 py-3">When</th>
                <th className="w-44 px-4 py-3">Who</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target</th>
                <th className="w-28 px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-200 align-top">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td
                    className="whitespace-nowrap px-4 py-2.5 text-ink-faint"
                    title={new Date(e.created_at).toLocaleString()}
                  >
                    {timeAgo(e.created_at)}
                  </td>
                  <td className="px-4 py-2.5">
                    {e.actor_role ? ROLE_LABELS[e.actor_role] : "System"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[13px] font-semibold">
                    {e.action}
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">{e.target ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {Object.keys(e.detail ?? {}).length > 0 ? (
                      <details>
                        <summary className="cursor-pointer text-xs font-semibold text-ink-soft">
                          View
                        </summary>
                        <pre className="mt-1 max-w-xs overflow-x-auto rounded bg-paper-100 p-1.5 text-[10px] text-ink-soft">
                          {JSON.stringify(e.detail, null, 1)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-faint">
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
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
