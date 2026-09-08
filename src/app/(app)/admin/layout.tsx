"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useCurrentUserContext } from "@/components/ProfileProvider";
import { hasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "Control room" },
  { href: "/admin/operations", label: "Operations" },
  { href: "/admin/token", label: "Tokens" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/stations", label: "Stations" },
  { href: "/admin/blindbox", label: "Blind box" },
  { href: "/admin/puzzles", label: "Puzzles" },
  { href: "/admin/sessions", label: "Sessions" },
  { href: "/admin/roster", label: "Roster" },
  { href: "/admin/schedule", label: "Schedule" },
  { href: "/admin/faq", label: "FAQ" },
  { href: "/admin/brand", label: "Brand" },
  { href: "/admin/nfc", label: "NFC" },
  { href: "/admin/audit", label: "Audit" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = useCurrentUserContext();
  const pathname = usePathname();

  if (!hasPermission(context.permissions, "admin.access")) {
    return (
      <p className="py-16 text-center text-sm text-ink-faint">
        Admin access required.
      </p>
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-5">
      <div className="-mx-3 mb-4 flex gap-1 overflow-x-auto px-3 pb-1 sm:-mx-5 sm:px-5 lg:sticky lg:top-6 lg:mx-0 lg:block lg:self-start lg:overflow-visible lg:px-0">
        {TABS.map((t) => {
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
