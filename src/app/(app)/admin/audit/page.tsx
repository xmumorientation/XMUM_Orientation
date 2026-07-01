"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Card, PageTitle, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { AuditEntry } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

// FR-11.4: global audit log, filterable by action type / free text.
export default function AdminAuditPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (action) query = query.ilike("action", `%${action}%`);
    const { data } = await query;
    setEntries((data as AuditEntry[]) ?? []);
    setLoading(false);
  }, [supabase, action]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <PageTitle title="Audit log" subtitle="Every state change, attributed (NFR-7)" />

      <Card>
        <input
          className="input"
          placeholder="Filter by action (e.g. tokens., gacha., projector.)…"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
      </Card>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <Card className="divide-y divide-base-200 p-0">
          {entries.map((e) => (
            <div key={e.id} className="px-4 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{e.action}</span>
                <span className="text-xs text-ink-faint">
                  {timeAgo(e.created_at)}
                </span>
              </div>
              <p className="text-xs text-ink-faint">
                {e.actor_role ?? "system"} → {e.target ?? "—"}
              </p>
              {Object.keys(e.detail ?? {}).length > 0 && (
                <pre className="mt-1 overflow-x-auto rounded bg-base-100 p-1.5 text-[10px] text-ink-soft">
                  {JSON.stringify(e.detail)}
                </pre>
              )}
            </div>
          ))}
          {entries.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-ink-faint">
              No entries match.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
