"use client";

import { usePathname } from "next/navigation";

import { LogsSectionTabs } from "@/components/admin/LogsSectionTabs";
import { useCurrentUserContext } from "@/components/ProfileProvider";
import { hasPermission } from "@/lib/permissions";

const LOG_ROUTES = [
  "/admin/logs",
  "/admin/token",
  "/admin/puzzles",
  "/admin/blindbox-log",
  "/admin/nfc",
  "/admin/audit",
  "/admin/correction-reasons",
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

  const showLogTabs = LOG_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  return (
    <div className="min-w-0 space-y-4">
      {showLogTabs && <LogsSectionTabs />}
      {children}
    </div>
  );
}
