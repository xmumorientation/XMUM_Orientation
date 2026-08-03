"use client";

import Link from "next/link";

import { NavIcon } from "@/components/NavIcon";
import { useProfile } from "@/components/ProfileProvider";
import { useGroup } from "@/components/useGroup";
import { Card, PageTitle, Skeleton, StatusPill } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/types";

type Action = {
  href: string;
  code: string;
  title: string;
  desc: string;
};

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
    <Card className="overflow-hidden border-brand-1/20 bg-white p-0">
      <div className="flex items-center justify-between border-b border-paper-200 bg-brand-1/20 px-4 py-3">
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
      className={`card flex items-center gap-3 p-4 transition-all duration-base ease-snappy hover:-translate-y-0.5 hover:border-brand-1/40 active:scale-[0.98] ${
        tone === "primary" ? "bg-brand-1/20" : ""
      }`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ink text-white shadow-raised">
        <NavIcon code={code} size={20} strokeWidth={1.75} />
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm leading-5 text-ink-faint">{desc}</span>
      </span>
    </Link>
  );
}

function primaryAction(role: string): Action {
  if (role === "freshie") {
    return {
      href: "/inventory",
      code: "IT",
      title: "Check your progress",
      desc: "See your group's collected pieces & rank.",
    };
  }
  if (role === "faci") {
    return {
      href: "/attendance",
      code: "AT",
      title: "Mark attendance",
      desc: "Mark your group members present.",
    };
  }
  if (role === "gm" || role === "guardian_gm") {
    return {
      href: "/gm",
      code: "GM",
      title: "Open station panel",
      desc: "Grant tokens, sell blind boxes & update stations.",
    };
  }
  if (role === "hof" || role === "hogm" || role === "committee") {
    return {
      href: "/committee",
      code: "OP",
      title: "Open operations",
      desc: "Live map, roster & event ops.",
    };
  }
  if (role === "admin") {
    return {
      href: "/admin",
      code: "AD",
      title: "Open control room",
      desc: "Live event controls, users & switches.",
    };
  }
  return {
    href: "/map",
    code: "MP",
    title: "Open campus map",
    desc: "Find game stations & live locations.",
  };
}

export default function DashboardPage() {
  const profile = useProfile();
  const role = profile.role;
  const main = primaryAction(role);

  return (
    <div className="space-y-4">
      <PageTitle
        title={`Hi, ${profile.full_name || "there"}!`}
        subtitle="Your event tools for the current orientation phase."
        action={<StatusPill tone="neutral">{ROLE_LABELS[role]}</StatusPill>}
      />

      <Link
        href={main.href}
        className="card block overflow-hidden border-brand-1/30 bg-white p-0 transition-all duration-base ease-snappy hover:-translate-y-0.5 hover:border-brand-1/60 active:scale-[0.98]"
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
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white">
              <NavIcon code={main.code} size={24} strokeWidth={1.75} />
            </span>
          </div>
        </div>
      </Link>

      {(role === "freshie" || role === "faci") && <TokenBalanceCard />}

      <div className="grid gap-3 sm:grid-cols-2">
        {(role === "freshie" || role === "faci") && (
          <>
            <ActionCard
              href="/inventory"
              code="IT"
              title="Inventory"
              desc="See your group's collected pieces & rank"
              tone="primary"
            />
            <ActionCard
              href="/transactions"
              code="TX"
              title="Token history"
              desc="Track every token earned & spent"
            />
          </>
        )}

        {role === "faci" && (
          <>
            <ActionCard
              href="/attendance"
              code="AT"
              title="Attendance"
              desc="Mark your group members present"
              tone="primary"
            />
            <ActionCard
              href="/checkin"
              code="CK"
              title="Location check-in"
              desc="Update group location for committee"
            />
          </>
        )}

        {(role === "gm" || role === "guardian_gm") && (
          <ActionCard
            href="/gm"
            code="GM"
            title="Station panel"
            desc="Grant tokens, sell blind boxes & update stations"
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
            desc="Live map, roster & event ops"
            tone="primary"
          />
        )}

        {role === "admin" && (
          <ActionCard
            href="/admin"
            code="AD"
            title="Admin console"
            desc="Live event controls, users & switches"
            tone="primary"
          />
        )}

        <ActionCard
          href="/map"
          code="MP"
          title="Campus map"
          desc="Find game stations & live locations"
        />
        <ActionCard
          href="/schedule"
          code="PL"
          title="Schedule"
          desc="Event timeline & phase schedule"
        />
        <ActionCard
          href="/faq"
          code="FQ"
          title="FAQ & contacts"
          desc="Need help? Q&A and emergency contacts"
        />
      </div>
    </div>
  );
}
