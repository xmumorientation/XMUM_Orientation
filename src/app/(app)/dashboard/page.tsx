"use client";

import Link from "next/link";

import { useProfile } from "@/components/ProfileProvider";
import { useGroup } from "@/components/useGroup";
import { Card, PageTitle } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/types";

function TokenBalanceCard() {
  const { group, loading } = useGroup();
  if (loading) return null;
  if (!group) {
    return (
      <Card className="text-center">
        <p className="text-sm text-ink-faint">
          You haven&apos;t been assigned to a group yet. You&apos;ll get your
          group at the registration counter — check back after check-in!
        </p>
      </Card>
    );
  }
  return (
    <Card className="bg-gradient-to-br from-star-goldsoft/20 via-white to-star-cyansoft/20 text-center">
      <p className="text-sm font-medium text-ink-soft">{group.name}</p>
      <p className="mt-1 text-5xl font-bold tabular-nums">
        {group.token_balance}
      </p>
      <p className="mt-1 text-sm text-ink-faint">tokens ✦</p>
    </Card>
  );
}

function QuickLink({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} className="card flex items-center gap-3 p-4">
      <span className="text-2xl">{icon}</span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-ink-faint">{desc}</span>
      </span>
    </Link>
  );
}

export default function DashboardPage() {
  const profile = useProfile();
  const role = profile.role;

  return (
    <div className="space-y-4">
      <PageTitle
        title={`Hi, ${profile.full_name || "there"}!`}
        subtitle={ROLE_LABELS[role]}
      />

      {(role === "freshie" || role === "faci") && <TokenBalanceCard />}

      <div className="space-y-3">
        {(role === "freshie" || role === "faci") && (
          <>
            <QuickLink
              href="/inventory"
              icon="🎒"
              title="Inventory"
              desc="Puzzle pieces & facility cards"
            />
            <QuickLink
              href="/transactions"
              icon="🧾"
              title="Token history"
              desc="Every earn & spend, fully logged"
            />
          </>
        )}

        {role === "faci" && (
          <>
            <QuickLink
              href="/attendance"
              icon="✅"
              title="Attendance"
              desc="Mark your group's roster"
            />
            <QuickLink
              href="/checkin"
              icon="📍"
              title="Location check-in"
              desc="Tell the committee where your group is"
            />
          </>
        )}

        {(role === "gm" || role === "guardian_gm") && (
          <QuickLink
            href="/gm"
            icon="🎮"
            title="Station panel"
            desc="Tokens, items, gacha & station status"
          />
        )}

        {role === "guardian_gm" && (
          <QuickLink
            href="/guardian"
            icon="🛡️"
            title="Guardian verification"
            desc="Verify puzzle sets & manage activation"
          />
        )}

        {(role === "hof" || role === "hogm" || role === "committee") && (
          <QuickLink
            href="/committee"
            icon="📡"
            title="Operations"
            desc="Live map, attendance & special draws"
          />
        )}

        {role === "admin" && (
          <QuickLink
            href="/admin"
            icon="⚙️"
            title="Admin console"
            desc="Users, game config, phases & kill-switches"
          />
        )}

        <QuickLink
          href="/map"
          icon="🗺️"
          title="Campus map"
          desc="Stations & live statuses"
        />
        <QuickLink
          href="/schedule"
          icon="🗓️"
          title="Schedule"
          desc="The full event rundown"
        />
        <QuickLink
          href="/faq"
          icon="❓"
          title="FAQ & contacts"
          desc="Stuck? Start here"
        />
      </div>
    </div>
  );
}
