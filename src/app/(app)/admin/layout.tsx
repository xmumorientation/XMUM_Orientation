"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useProfile } from "@/components/ProfileProvider";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "War room" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/stations", label: "Stations" },
  { href: "/admin/blindbox", label: "Blind box" },
  { href: "/admin/puzzles", label: "Puzzles" },
  { href: "/admin/sessions", label: "Sessions" },
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
  const profile = useProfile();
  const pathname = usePathname();

  if (profile.role !== "admin") {
    return (
      <p className="py-16 text-center text-sm text-ink-faint">
        Admin access required.
      </p>
    );
  }

  return (
    <div>
      <div className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 pb-1">
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
                "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold",
                active
                  ? "bg-ink text-white"
                  : "bg-white text-ink-soft shadow-card"
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
