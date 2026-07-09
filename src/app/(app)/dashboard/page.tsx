"use client";

import Link from "next/link";

import { useProfile } from "@/components/ProfileProvider";
import { useGroup } from "@/components/useGroup";
import { Card, PageTitle, Skeleton, StatusPill } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/types";

function TokenBalanceCard() {
  const { group, loading } = useGroup();
  if (loading) return <Skeleton className="h-[132px]" />;
  if (!group) {
    return (
      <Card className="border-amber-200 bg-amber-50/90">
        <StatusPill tone="warning">Group pending</StatusPill>
        <p className="mt-3 text-sm leading-5 text-amber-900">
          You have not been assigned to a group yet. Check again after the
          registration counter finishes your check-in.
        </p>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden border-star-cyan/20 bg-white p-0">
      <div className="flex items-center justify-between border-b border-base-200 bg-star-cyansoft/20 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-ink-soft">{group.name}</p>
          <p className="text-xs text-ink-faint">Current group balance</p>
        </div>
        <StatusPill tone="info">Live</StatusPill>
      </div>
      <div className="px-4 py-5">
        <p className="text-6xl font-black leading-none tracking-tight tabular-nums">
          {group.token_balance}
        </p>
        <p className="mt-2 text-sm font-semibold text-ink-faint">tokens</p>
      </div>
    </Card>
  );
}

function ActionCard({
  href,
  code,
  title,
  desc,
  tone = "default",
}: {
  href: string;
  code: string;
  title: string;
  desc: string;
  tone?: "default" | "primary";
}) {
  return (
    <Link
      href={href}
      className={`card flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-star-cyan/40 ${
        tone === "primary" ? "bg-star-cyansoft/20" : ""
      }`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ink text-xs font-black tracking-tight text-white">
        {code}
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm leading-5 text-ink-faint">{desc}</span>
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
        subtitle="Your event tools for the current orientation phase."
        action={<StatusPill tone="neutral">{ROLE_LABELS[role]}</StatusPill>}
      />

      {(role === "freshie" || role === "faci") && <TokenBalanceCard />}

      <div className="grid gap-3">
        {(role === "freshie" || role === "faci") && (
          <>
            <ActionCard
              href="/inventory"
              code="IT"
              title="Inventory"
              desc="Puzzle pieces & facility cards"
              tone="primary"
            />
            <ActionCard
              href="/transactions"
              code="TX"
              title="Token history"
              desc="Every earn & spend, fully logged"
            />
          </>
        )}

        {role === "faci" && (
          <>
            <ActionCard
              href="/attendance"
              code="AT"
              title="Attendance"
              desc="Mark your group's roster"
              tone="primary"
            />
            <ActionCard
              href="/checkin"
              code="CK"
              title="Location check-in"
              desc="Tell the committee where your group is"
            />
          </>
        )}

        {(role === "gm" || role === "guardian_gm") && (
          <ActionCard
            href="/gm"
            code="GM"
            title="Station panel"
            desc="Tokens, items, gacha & station status"
            tone="primary"
          />
        )}

        {role === "guardian_gm" && (
          <ActionCard
            href="/guardian"
            code="VG"
            title="Guardian verification"
            desc="Verify puzzle sets & manage activation"
          />
        )}

        {(role === "hof" || role === "hogm" || role === "committee") && (
          <ActionCard
            href="/committee"
            code="OP"
            title="Operations"
            desc="Live map, attendance & special draws"
            tone="primary"
          />
        )}

        {role === "admin" && (
          <ActionCard
            href="/admin"
            code="AD"
            title="Admin console"
            desc="Users, game config, phases & kill-switches"
            tone="primary"
          />
        )}

        <ActionCard
          href="/map"
          code="MP"
          title="Campus map"
          desc="Stations & live statuses"
        />
        <ActionCard
          href="/schedule"
          code="PL"
          title="Schedule"
          desc="The full event rundown"
        />
        <ActionCard
          href="/faq"
          code="FQ"
          title="FAQ & contacts"
          desc="Stuck? Start here"
        />
      </div>
    </div>
  );
}
