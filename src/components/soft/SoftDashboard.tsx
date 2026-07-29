"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { useGroup } from "@/components/useGroup";
import type { Action } from "@/components/DashboardShared";
import { ROLE_LABELS, type Profile } from "@/lib/types";

// Round 4/5 language applied to the real, role-aware dashboard: one quiet
// header, one hero action card (still the single accent moment), tokens as
// a slim row instead of a boxed number, and every other link folded into
// one rounded list instead of a tile grid.
function SoftTokenRow() {
  const { group, loading } = useGroup();
  if (loading) {
    return <div className="h-14 animate-pulse rounded-2xl bg-paper-100" />;
  }
  if (!group) {
    return (
      <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Group pending — check again after registration check-in.
      </div>
    );
  }
  return (
    <Link
      href="/transactions"
      className="flex items-center justify-between rounded-2xl bg-white px-5 py-4 shadow-raised transition hover:-translate-y-0.5"
    >
      <span className="text-sm font-semibold text-ink-soft">
        {group.name} · tokens
      </span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-xl font-black tabular-nums">
          {group.token_balance}
        </span>
        <ChevronRight size={16} className="text-ink-faint" />
      </span>
    </Link>
  );
}

export function SoftDashboard({
  profile,
  main,
  actions,
  showTokenCard,
}: {
  profile: Profile;
  main: Action;
  actions: Action[];
  showTokenCard: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-lg text-ink-faint">
            Hi, {profile.full_name || "there"}
          </p>
        </div>
        <span className="rounded-full border border-paper-300 bg-white px-3 py-1 text-xs font-bold text-ink-faint">
          {ROLE_LABELS[profile.role]}
        </span>
      </div>

      <Link
        href={main.href}
        className="block rounded-3xl bg-white p-6 shadow-floating transition hover:-translate-y-0.5"
      >
        <p className="text-xs font-black uppercase tracking-[0.2em] text-ink-faint">
          Your next action
        </p>
        <p className="mt-3 text-3xl font-black tracking-tight text-ink">
          {main.title}
        </p>
        <p className="mt-2 max-w-[42ch] text-sm leading-5 text-ink-faint">
          {main.desc}
        </p>
        <span className="btn-primary mt-5 w-full">{main.title}</span>
      </Link>

      {showTokenCard && <SoftTokenRow />}

      <div className="overflow-hidden rounded-3xl bg-white shadow-raised">
        {actions.map((a, i) => (
          <Link
            key={a.href}
            href={a.href}
            className={`flex min-h-[64px] items-center gap-3 px-5 transition hover:bg-paper-50 ${
              i > 0 ? "border-t border-paper-100" : ""
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">{a.title}</span>
              <span className="block text-sm text-ink-faint">{a.desc}</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-ink-faint" />
          </Link>
        ))}
      </div>
    </div>
  );
}
