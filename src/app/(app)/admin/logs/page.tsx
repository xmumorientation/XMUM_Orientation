"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, EmptyState, ErrorBanner, PageTitle, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { AuditEntry } from "@/lib/types";
import { friendlyError } from "@/lib/utils";

type AuditRow = AuditEntry & { reason?: string | null; before_state?: unknown; after_state?: unknown };

export default function AdminLogsPage() {
  const db = useMemo(() => supabaseBrowser(), []);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: requestError } = await db.rpc("fn_admin_search_audit", {
      p_query: query || null, p_action: action || null, p_actor: actor || null,
      p_from: from || null, p_to: to || null, p_limit: 200,
    });
    setLoading(false);
    if (requestError) setError(friendlyError(requestError));
    else setRows((data as AuditRow[]) ?? []);
  }, [db, query, action, actor, from, to]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <PageTitle title="Logs & Corrections" subtitle="Choose a section above, or search the complete audit history here." />
      <Card className="space-y-3">
        <h2 className="font-black">Filter audit history</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="input" placeholder="Group, station, item or reference" value={query} onChange={(event) => setQuery(event.target.value)} />
          <input className="input" placeholder="Action" value={action} onChange={(event) => setAction(event.target.value)} />
          <input className="input" placeholder="User UUID" value={actor} onChange={(event) => setActor(event.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className="input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            <input className="input" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
        </div>
        <button className="btn-primary w-full" onClick={() => void load()}>Filter</button>
      </Card>
      <ErrorBanner message={error} />
      {loading ? <div className="flex justify-center py-10"><Spinner /></div> : rows.length === 0 ? (
        <EmptyState title="No records" message="No audit records match these combined filters." />
      ) : <div className="space-y-2">{rows.map((row) => (
        <Card key={row.id} className="p-3">
          <div className="flex justify-between gap-2"><p className="font-semibold">{row.action}</p><time className="text-xs text-ink-faint">{new Date(row.created_at).toLocaleString()}</time></div>
          <p className="text-xs text-ink-faint">{row.actor_role ?? "system"} · {row.target ?? "—"}</p>
          {row.reason && <p className="mt-2 text-sm">Reason: {row.reason}</p>}
          <details className="mt-2 text-xs"><summary className="cursor-pointer font-semibold">Before / after / details</summary><pre className="mt-2 overflow-auto rounded-xl bg-paper-100 p-2">{JSON.stringify({ before: row.before_state, after: row.after_state, detail: row.detail }, null, 2)}</pre></details>
        </Card>
      ))}</div>}
    </div>
  );
}
