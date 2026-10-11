"use client";

import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Card, ErrorBanner, PageTitle, Spinner, SuccessBanner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Group } from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

type Headcount = { group_id: number; headcount: number; updated_at: string };

function without<T extends Record<string, unknown>>(obj: T, key: string): T {
  const next = { ...obj };
  delete next[key];
  return next;
}

// One headcount per group, always open: Admin can set, correct or clear any
// group's number at any time, and Faci changes arrive live. Every change is
// logged in the audit log (fn_set_headcount / fn_clear_headcount).
export default function HeadcountPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [groups, setGroups] = useState<Group[]>([]);
  const [counts, setCounts] = useState<Record<number, Headcount>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: grps }, { data: hcs }] = await Promise.all([
      supabase.from("groups").select("*").order("id"),
      supabase.from("group_headcounts").select("group_id, headcount, updated_at"),
    ]);
    setGroups((grps as Group[]) ?? []);
    setCounts(Object.fromEntries(((hcs as Headcount[]) ?? []).map((h) => [h.group_id, h])));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("admin-headcount")
      .on("postgres_changes", { event: "*", schema: "public", table: "group_headcounts" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, supabase]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2500);
  }

  const nameOf = (id: number) => groups.find((g) => g.id === id)?.name ?? "Group";

  async function save(groupId: number) {
    const key = String(groupId);
    const raw = drafts[key];
    if (raw === undefined) return;
    const value = parseInt(raw, 10);
    if (raw === "" || Number.isNaN(value) || value < 0 || value === counts[groupId]?.headcount) {
      setDrafts((d) => without(d, key));
      return;
    }
    setSavingId(groupId);
    setError(null);
    const { error: rpcError } = await supabase.rpc("fn_set_headcount", {
      p_count: value,
      p_group_id: groupId,
    });
    setSavingId(null);
    if (rpcError) return setError(friendlyError(rpcError));
    setDrafts((d) => without(d, key));
    flash(`${nameOf(groupId)}: ${value} saved.`);
    load();
  }

  async function clear(groupId: number) {
    if (!window.confirm(`Clear ${nameOf(groupId)}'s headcount?`)) return;
    setSavingId(groupId);
    setError(null);
    const { error: rpcError } = await supabase.rpc("fn_clear_headcount", { p_group_id: groupId });
    setSavingId(null);
    if (rpcError) return setError(friendlyError(rpcError));
    flash(`${nameOf(groupId)}: headcount cleared.`);
    load();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const reported = groups.filter((g) => counts[g.id] !== undefined);
  const total = reported.reduce((sum, g) => sum + counts[g.id].headcount, 0);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Headcount"
        subtitle="Every group's headcount. Always open: click a number to set or correct it; Enter saves."
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-paper-200 text-xs font-bold text-ink-faint">
              <th className="px-4 py-3">Group</th>
              <th className="px-3 py-3">Headcount</th>
              <th className="px-3 py-3">Updated</th>
              <th className="w-12 px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-200">
            {groups.map((g) => {
              const key = String(g.id);
              const current = counts[g.id];
              const value = drafts[key] ?? (current ? String(current.headcount) : "");
              return (
                <tr key={g.id}>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2 whitespace-nowrap font-medium">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ background: g.color || "#008CFF" }}
                        aria-hidden
                      />
                      {g.name}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      aria-label={`${g.name} headcount`}
                      placeholder="—"
                      disabled={savingId === g.id}
                      className={cn(
                        "input min-h-[36px] w-24 text-sm tabular-nums",
                        drafts[key] !== undefined && "ring-2 ring-amber-400"
                      )}
                      value={value}
                      onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                      onBlur={() => save(g.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setDrafts((d) => without(d, key));
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-faint">
                    {current ? new Date(current.updated_at).toLocaleString() : "Not counted yet"}
                  </td>
                  <td className="px-3 py-2">
                    {current && (
                      <button
                        type="button"
                        disabled={savingId === g.id}
                        onClick={() => clear(g.id)}
                        className="text-red-500 disabled:opacity-50"
                        aria-label={`Clear ${g.name} headcount`}
                      >
                        <Trash2 size={16} strokeWidth={1.75} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-paper-300 font-bold">
              <td className="px-4 py-3">Total</td>
              <td className="px-3 py-3" colSpan={3}>
                <span className="tabular-nums">{total}</span>
                <span className="ml-2 text-[11px] font-normal text-ink-faint">
                  {reported.length}/{groups.length} groups
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  );
}
