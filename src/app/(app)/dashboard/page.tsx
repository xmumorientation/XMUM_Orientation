"use client";

import Link from "next/link";

import { useDesignVariant } from "@/components/DesignVariantProvider";
import {
  ActionCard,
  primaryAction,
  secondaryActions,
  TokenBalanceCard,
} from "@/components/DashboardShared";
import { useProfile } from "@/components/ProfileProvider";
import { PageTitle, StatusPill } from "@/components/ui";
import { SoftDashboard } from "@/components/soft/SoftDashboard";
import { ROLE_LABELS } from "@/lib/types";

export default function DashboardPage() {
  const profile = useProfile();
  const { variant } = useDesignVariant();
  const role = profile.role;
  const main = primaryAction(role);
  const actions = secondaryActions(role);

  if (variant === "soft") {
    return (
      <SoftDashboard
        profile={profile}
        main={main}
        actions={actions}
        showTokenCard={role === "freshie" || role === "faci"}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title={`Hi, ${profile.full_name || "there"}!`}
        subtitle="Your event tools for the current orientation phase."
        action={<StatusPill tone="neutral">{ROLE_LABELS[role]}</StatusPill>}
      />

      <Link
        href={main.href}
        className="card block overflow-hidden border-brand-1/30 bg-white p-0 transition hover:-translate-y-0.5 hover:border-brand-1/60"
      >
        <div className="bg-[linear-gradient(90deg,var(--brand-1),var(--brand-2))] px-4 py-3 text-white">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-white/75">
            Next action
          </p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-black tracking-tight">{main.title}</p>
              <p className="mt-1 max-w-[42ch] text-sm leading-5 text-white/80">
                {main.desc}
              </p>
            </div>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-sm font-black">
              {main.code}
            </span>
          </div>
        </div>
      </Link>

      {(role === "freshie" || role === "faci") && <TokenBalanceCard />}

      <div className="grid gap-3 sm:grid-cols-2">
        {actions.map((a) => (
          <ActionCard
            key={a.href}
            href={a.href}
            code={a.code}
            title={a.title}
            desc={a.desc}
            tone={a.primary ? "primary" : "default"}
          />
        ))}
      </div>
    </div>
  );
}
