"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useCurrentUserContext } from "@/components/ProfileProvider";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string; permissions: Permission[] }[] = [
  { href: "/admin/logs", label: "Overview", permissions: ["logs.audit"] },
  { href: "/admin/token", label: "Token", permissions: ["logs.token", "token.manage"] },
  { href: "/admin/puzzles", label: "Puzzle", permissions: ["logs.puzzle", "puzzle.manage"] },
  { href: "/admin/blindbox-log", label: "Blind Box", permissions: ["logs.blindbox"] },
  { href: "/admin/nfc", label: "NFC", permissions: ["logs.nfc", "nfc.recovery"] },
  { href: "/admin/audit", label: "Audit", permissions: ["logs.audit"] },
  { href: "/admin/correction-reasons", label: "Reasons", permissions: ["correction_reasons.manage"] },
];

export function LogsSectionTabs() {
  const pathname = usePathname();
  const { permissions } = useCurrentUserContext();
  const visible = TABS.filter((tab) => tab.permissions.some((permission) => permissions.includes(permission)));

  return (
    <nav aria-label="Logs and corrections sections" className="flex gap-2 overflow-x-auto pb-1">
      {visible.map((tab) => {
        const selected = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-colors",
              selected ? "bg-ink text-white" : "bg-white text-ink-soft shadow-card hover:text-ink"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
