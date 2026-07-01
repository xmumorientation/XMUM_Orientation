"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Card, ErrorBanner, PageTitle, SuccessBanner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { GachaPool, GachaPoolEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

// FR-7.3: edit probability weights & pool contents without redeploy.
export default function AdminGachaPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [pools, setPools] = useState<GachaPool[]>([]);
  const [entries, setEntries] = useState<GachaPoolEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: ps }, { data: es }] = await Promise.all([
      supabase.from("gacha_pools").select("*").order("id"),
      supabase.from("gacha_pool_entries").select("*").order("id"),
    ]);
    setPools((ps as GachaPool[]) ?? []);
    setEntries((es as GachaPoolEntry[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function updatePool(id: number, patch: Partial<GachaPool>) {
    const { error } = await supabase
      .from("gacha_pools")
      .update(patch)
      .eq("id", id);
    if (error) setError(error.message);
    else {
      setPools((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      setNotice("Saved.");
      setTimeout(() => setNotice(null), 1500);
    }
  }

  async function updateEntry(id: number, patch: Partial<GachaPoolEntry>) {
    const { error } = await supabase
      .from("gacha_pool_entries")
      .update(patch)
      .eq("id", id);
    if (error) setError(error.message);
    else {
      setEntries((es) =>
        es.map((e) => (e.id === id ? { ...e, ...patch } : e))
      );
      setNotice("Saved.");
      setTimeout(() => setNotice(null), 1500);
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Gacha configuration"
        subtitle="Weights & stock are live — changes apply to the next draw"
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      {pools.map((pool) => {
        const poolEntries = entries.filter((e) => e.pool_id === pool.id);
        const totalWeight = poolEntries
          .filter((e) => e.remaining === null || e.remaining > 0)
          .reduce((s, e) => s + Number(e.weight), 0);
        return (
          <Card key={pool.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{pool.name}</h2>
                <p className="text-xs text-ink-faint">
                  key: {pool.key} · cost {pool.cost_tokens} · bonus +
                  {pool.bonus_tokens} · roles: {pool.allowed_roles.join(", ")}
                </p>
              </div>
              <button
                onClick={() => updatePool(pool.id, { enabled: !pool.enabled })}
                className={cn(
                  "btn min-w-[70px] text-sm",
                  pool.enabled
                    ? "bg-green-600 text-white"
                    : "border border-base-300 bg-white text-ink-faint"
                )}
              >
                {pool.enabled ? "Enabled" : "Disabled"}
              </button>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-faint">
                  <th className="pb-1">Prize</th>
                  <th className="pb-1 text-right">Weight</th>
                  <th className="pb-1 text-right">%</th>
                  <th className="pb-1 text-right">Stock</th>
                </tr>
              </thead>
              <tbody>
                {poolEntries.map((e) => {
                  const inPlay = e.remaining === null || e.remaining > 0;
                  const pct =
                    totalWeight > 0 && inPlay
                      ? ((Number(e.weight) / totalWeight) * 100).toFixed(1)
                      : "0";
                  return (
                    <tr
                      key={e.id}
                      className={cn(
                        "border-t border-base-200",
                        !inPlay && "opacity-40"
                      )}
                    >
                      <td className="py-1.5 pr-2">{e.label}</td>
                      <td className="py-1.5 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          className="input inline-block min-h-[32px] w-20 px-2 py-0 text-right text-sm"
                          defaultValue={Number(e.weight)}
                          onBlur={(ev) =>
                            updateEntry(e.id, {
                              weight: Number(ev.target.value),
                            })
                          }
                        />
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-ink-faint">
                        {pct}%
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {e.remaining === null ? "∞" : e.remaining}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        );
      })}
    </div>
  );
}
