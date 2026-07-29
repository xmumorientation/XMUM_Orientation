"use client";

import Link from "next/link";

import { NavIcon } from "@/components/NavIcon";
import { useGroup } from "@/components/useGroup";
import { Card, Skeleton, StatusPill } from "@/components/ui";

export type Action = {
  href: string;
  code: string;
  title: string;
  desc: string;
  primary?: boolean;
};

export function TokenBalanceCard() {
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

export function ActionCard({
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
      className={`card flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-brand-1/40 ${
        tone === "primary" ? "bg-brand-1/20" : ""
      }`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ink text-white">
        <NavIcon code={code} />
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm leading-5 text-ink-faint">{desc}</span>
      </span>
    </Link>
  );
}

export function primaryAction(role: string): Action {
  if (role === "freshie") {
    return {
      href: "/inventory",
      code: "IT",
      title: "Check your progress",
      desc: "See the puzzle pieces, tokens, and rewards your group has earned so far.",
    };
  }
  if (role === "faci") {
    return {
      href: "/attendance",
      code: "AT",
      title: "Mark attendance",
      desc: "Update your group roster before moving on.",
    };
  }
  if (role === "gm" || role === "guardian_gm") {
    return {
      href: "/gm",
      code: "GM",
      title: "Open station panel",
      desc: "Run rewards, Day 2 results, boxes, and station status.",
    };
  }
  if (role === "hof" || role === "hogm" || role === "committee") {
    return {
      href: "/committee",
      code: "OP",
      title: "Open operations",
      desc: "Check map, attendance, balances, and registration.",
    };
  }
  if (role === "admin") {
    return {
      href: "/admin",
      code: "AD",
      title: "Open war room",
      desc: "Control phases, kill-switches, users, and game config.",
    };
  }
  return {
    href: "/map",
    code: "MP",
    title: "Open campus map",
    desc: "Find stations and live statuses.",
  };
}

// Same secondary links for both variants — classic renders them as a
// tile grid, soft renders them as a single rounded list (Round 4 language).
export function secondaryActions(role: string): Action[] {
  const items: Action[] = [];

  if (role === "freshie" || role === "faci") {
    items.push(
      {
        href: "/inventory",
        code: "IT",
        title: "My items",
        desc: "Puzzle pieces and rewards your group has collected",
        primary: true,
      },
      {
        href: "/transactions",
        code: "TX",
        title: "Token history",
        desc: "Where your group earned and spent tokens",
      }
    );
  }

  if (role === "faci") {
    items.push(
      {
        href: "/attendance",
        code: "AT",
        title: "Attendance",
        desc: "Mark your group's roster",
        primary: true,
      },
      {
        href: "/checkin",
        code: "CK",
        title: "Location check-in",
        desc: "Tell the committee where your group is",
      }
    );
  }

  if (role === "gm" || role === "guardian_gm") {
    items.push({
      href: "/gm",
      code: "GM",
      title: "Station panel",
      desc: "Tokens, items & station status",
      primary: true,
    });
  }

  if (role === "guardian_gm") {
    items.push({
      href: "/guardian",
      code: "VG",
      title: "Guardian verification",
      desc: "Verify puzzle sets & manage activation",
    });
  }

  if (role === "hof" || role === "hogm" || role === "committee") {
    items.push({
      href: "/committee",
      code: "OP",
      title: "Operations",
      desc: "Live map, attendance & balances",
      primary: true,
    });
  }

  if (role === "admin") {
    items.push({
      href: "/admin",
      code: "AD",
      title: "Admin console",
      desc: "Users, game config, phases & kill-switches",
      primary: true,
    });
  }

  items.push(
    {
      href: "/map",
      code: "MP",
      title: "Campus map",
      desc: "Find game stations and see which are open right now",
    },
    {
      href: "/schedule",
      code: "PL",
      title: "Schedule",
      desc: "What's happening today, hour by hour",
    },
    {
      href: "/faq",
      code: "FQ",
      title: "FAQ & contacts",
      desc: "Stuck or lost? Start here",
    }
  );

  return items;
}
