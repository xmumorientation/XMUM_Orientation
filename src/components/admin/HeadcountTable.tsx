"use client";

import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Card, ErrorBanner, Spinner, SuccessBanner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Group } from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

type Headcount = {
  group_id: number;
  headcount: number;
  local_count: number | null;
  international_count: number | null;
  updated_at: string;
};

type Field = "local" | "international" | "total";

const FIELDS: { key: Field; label: string }[] = [
  { key: "local", label: "Local" },
  { key: "international", label: "International" },
  { key: "total", label: "Total" },
];

function valueOf(h: Headcount | undefined, f: Field): number | null {
  if (!h) return null;
  return f === "local" ? h.local_count : f === "international" ? h.international_count : h.headcount;
}

function without<T extends Record<string, unknown>>(obj: T, key: string): T {
  const next = { ...obj };
  delete next[key];
  return next;
}

// One headcount (Local / International / Total) per group, always open: Admin
// can set, correct or clear any group's numbers at any time, and Faci changes
// arrive live. Used by Admin > Headcount and Admin > Freshie control. Every
// change is logged in the audit log (fn_set_headcount / fn_clear_headcount).
export function HeadcountTable() {
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
      supabase
        .from("group_headcounts")
        .select("group_id, headcount, local_count, international_count, updated_at"),
    ]);
    setGroups((grps as Group[]) ?? []);
    setCounts(Object.fromEntries(((hcs as Headcount[]) ?? []).map((h) => [h.group_id, h])));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`admin-headcount-${crypto.randomUUID()}`)
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

  async function save(groupId: number, field: Field) {
    const key = `${groupId}:${field}`;
    const raw = drafts[key];
    if (raw === undefined) return;
    const current = counts[groupId];
    const blank = raw === "";
    const parsed = parseInt(raw, 10);
    const value = blank ? null : parsed;
    // Total is required; Local / International may be blank ("not counted").
    const rejected =
      (blank && (field === "total" || !current)) ||
      (!blank && (Number.isNaN(parsed) || parsed < 0));
    if (rejected || value === valueOf(current, field)) {
      setDrafts((d) => without(d, key));
      return;
    }
    const next = {
      local: valueOf(current, "local"),
      international: valueOf(current, "international"),
      total: valueOf(current, "total"),
      [field]: value,
    };
    // A split entered before any Total: Total follows the split until set.
    const total = next.total ?? (next.local ?? 0) + (next.international ?? 0);
    setSavingId(groupId);
    setError(null);
    const { error: rpcError } = await supabase.rpc("fn_set_headcount", {
      p_count: total,
      p_group_id: groupId,
      p_local: next.local,
      p_international: next.international,
    });
    setSavingId(null);
    if (rpcError) return setError(friendlyError(rpcError));
    setDrafts((d) => without(d, key));
    flash(`${nameOf(groupId)} saved.`);
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

  // Blank is "not counted", not 0: sum only the groups that reported.
  const sums = FIELDS.map(({ key }) => {
    const reported = groups.filter((g) => valueOf(counts[g.id], key) !== null);
    return {
      key,
      sum: reported.reduce((s, g) => s + (valueOf(counts[g.id], key) ?? 0), 0),
      reported: reported.length,
    };
  });

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-paper-200 text-xs font-bold text-ink-faint">
              <th className="px-4 py-3">Group</th>
              {FIELDS.map((f) => (
                <th key={f.key} className="px-3 py-3">
                  {f.label}
                </th>
              ))}
              <th className="px-3 py-3">Updated</th>
              <th className="w-12 px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-200">
            {groups.map((g) => {
              const current = counts[g.id];
              const mismatch =
                current &&
                current.local_count !== null &&
                current.international_count !== null &&
                current.local_count + current.international_count !== current.headcount;
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
                  {FIELDS.map((f) => {
                    const key = `${g.id}:${f.key}`;
                    const cur = valueOf(current, f.key);
                    return (
                      <td key={f.key} className="px-3 py-1.5">
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          aria-label={`${g.name} ${f.label.toLowerCase()} headcount`}
                          placeholder="—"
                          disabled={savingId === g.id}
                          className={cn(
                            "input min-h-[36px] w-24 text-sm tabular-nums",
                            drafts[key] !== undefined && "ring-2 ring-amber-400"
                          )}
                          value={drafts[key] ?? (cur !== null ? String(cur) : "")}
                          onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                          onBlur={() => save(g.id, f.key)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") setDrafts((d) => without(d, key));
                          }}
                        />
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-xs text-ink-faint">
                    {current ? new Date(current.updated_at).toLocaleString() : "Not counted yet"}
                    {mismatch && (
                      <p className="text-amber-600">
                        Local + International = {current.local_count! + current.international_count!}, differs from Total
                      </p>
                    )}
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
              {sums.map((s) => (
                <td key={s.key} className="px-3 py-3">
                  <span className="tabular-nums">{s.sum}</span>
                  <span className="block text-[11px] font-normal text-ink-faint">
                    {s.reported}/{groups.length} groups
                  </span>
                </td>
              ))}
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  );
}
