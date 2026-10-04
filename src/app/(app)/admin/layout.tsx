"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useCurrentUserContext } from "@/components/ProfileProvider";
import { hasPermission } from "@/lib/permissions";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const TABS: {href:string;label:string;permissions:Permission[]}[] = [
  { href: "/admin", label: "Control room", permissions:["admin.access"] },
  { href: "/admin/operations", label: "Operations", permissions:["operations.manage"] },
  { href: "/admin/logs", label: "Logs & corrections", permissions:["logs.audit"] },
  { href: "/admin/token", label: "Tokens", permissions:["token.manage","logs.token"] },
  { href: "/admin/correction-reasons", label: "Correction reasons", permissions:["correction_reasons.manage"] },
  { href: "/admin/accounts", label: "Accounts & allocation", permissions:["accounts.manage","accounts.view","allocation.faci.manage","allocation.gm.manage"] },
  { href: "/admin/configuration", label: "Configuration", permissions:["configuration.manage","configuration.gameplay.manage"] },
  { href: "/admin/blindbox-log", label: "Blind box log", permissions:["logs.blindbox"] },
  { href: "/admin/users", label: "Users", permissions:["accounts.manage"] },
  { href: "/admin/stations", label: "Stations", permissions:["stations.manage"] },
  { href: "/admin/blindbox", label: "Blind box", permissions:["admin.access"] },
  { href: "/admin/puzzles", label: "Puzzles", permissions:["puzzle.manage","logs.puzzle"] },
  { href: "/admin/sessions", label: "Sessions", permissions:["admin.access"] },
  { href: "/admin/roster", label: "Roster", permissions:["accounts.manage"] },
  { href: "/admin/schedule", label: "Schedule", permissions:["admin.access"] },
  { href: "/admin/faq", label: "FAQ", permissions:["admin.access"] },
  { href: "/admin/brand", label: "Brand", permissions:["admin.access"] },
  { href: "/admin/nfc", label: "NFC", permissions:["nfc.recovery"] },
  { href: "/admin/audit", label: "Audit", permissions:["logs.audit"] },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = useCurrentUserContext();
  const pathname = usePathname();

  if (!hasPermission(context.permissions, "admin.access") && !hasPermission(context.permissions, "management.access")) {
    return (
      <p className="py-16 text-center text-sm text-ink-faint">
        Admin access required.
      </p>
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-5">
      <div className="-mx-3 mb-4 flex gap-1 overflow-x-auto px-3 pb-1 sm:-mx-5 sm:px-5 lg:sticky lg:top-6 lg:mx-0 lg:block lg:self-start lg:overflow-visible lg:px-0">
        {TABS.filter(t=>t.permissions.some(permission=>hasPermission(context.permissions,permission))).map((t) => {
          const active =
            t.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold lg:mb-1 lg:flex lg:min-h-[40px] lg:items-center lg:rounded-xl",
                active
                  ? "bg-ink text-white"
                  : "bg-white text-ink-soft shadow-card hover:text-ink"
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
