"use client";

import Link from "next/link";
import { Bell, Lightbulb, WalletCards } from "lucide-react";

import { useProfile } from "@/components/ProfileProvider";
import { useGroup } from "@/components/useGroup";

// A read-only shortcut for facilitator group activity. Gameplay mutations
// remain in their role-authorized backend functions.
export function GroupUpdatesBanner() {
  const profile = useProfile();
  const { group } = useGroup();

  if (profile.role !== "faci" || !profile.group_id) return null;

  return (
    <section className="mb-4 rounded-2xl border border-brand-1/20 bg-brand-1/10 p-3 shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-1 text-white">
          <Bell size={18} />
        </span>
        <div>
          <p className="text-sm font-black text-ink">Group updates</p>
          <p className="text-xs text-ink-faint">Token and Lighting Zone activity</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href="/transactions" className="flex min-h-[54px] items-center gap-2 rounded-xl bg-white px-3 shadow-raised">
          <WalletCards size={19} className="shrink-0 text-brand-1" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-black text-ink">{group?.token_balance ?? "--"} tokens</span>
            <span className="block text-xs text-ink-faint">View earn/spend history</span>
          </span>
        </Link>
        <Link href="/lighting" className="flex min-h-[54px] items-center gap-2 rounded-xl bg-white px-3 shadow-raised">
          <Lightbulb size={19} className="shrink-0 text-brand-2" />
          <span className="min-w-0">
            <span className="block text-sm font-black text-ink">Lighting Zone</span>
            <span className="block text-xs text-ink-faint">View group updates</span>
          </span>
        </Link>
      </div>
    </section>
  );
}
