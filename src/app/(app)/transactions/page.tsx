"use client";

import { useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { useGroup } from "@/components/useGroup";
import { Card, EmptyState, PageTitle, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { TokenTransaction } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

// FR-5.4: full transaction history for the group — dispute prevention.
export default function TransactionsPage() {
  const profile = useProfile();
  const { group } = useGroup();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const PAGE_SIZE = 100;
  const [txs, setTxs] = useState<TokenTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!profile.group_id) {
      setLoading(false);
      return;
    }
    let active = true;

    async function load() {
      // Fetch one extra row to detect whether more history exists.
      const { data } = await supabase
        .from("token_transactions")
        .select("*")
        .eq("group_id", profile.group_id!)
        .order("created_at", { ascending: false })
        .limit(limit + 1);
      if (active) {
        const rows = (data as TokenTransaction[]) ?? [];
        setHasMore(rows.length > limit);
        setTxs(rows.slice(0, limit));
        setLoading(false);
      }
    }
    load();

    const channel = supabase
      .channel(`tx-${profile.group_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "token_transactions",
          filter: `group_id=eq.${profile.group_id}`,
        },
        load
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, profile.group_id, limit]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Token history"
        subtitle={group ? `${group.name} · balance ${group.token_balance}` : undefined}
      />
      {txs.length === 0 ? (
        <EmptyState message="No transactions yet. Win station games to earn tokens!" />
      ) : (
        <Card className="divide-y divide-paper-200 p-0">
          {txs.map((tx) => (
            <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className={cn(
                  "min-w-[52px] text-center text-lg font-bold tabular-nums",
                  tx.delta > 0 ? "text-green-600" : "text-red-600"
                )}
              >
                {tx.delta > 0 ? `+${tx.delta}` : tx.delta}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {tx.reason || "Token adjustment"}
                </p>
                <p className="text-xs text-ink-faint">
                  {timeAgo(tx.created_at)} ·{" "}
                  {new Date(tx.created_at).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
        </Card>
      )}
      {hasMore && (
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
