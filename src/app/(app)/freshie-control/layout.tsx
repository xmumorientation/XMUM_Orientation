"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useProfile } from "@/components/ProfileProvider";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/freshie-control", label: "Groups" },
  { href: "/freshie-control/sessions", label: "Sessions" },
  { href: "/freshie-control/headcount", label: "Headcount" },
];

export default function FreshieControlLayout({
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
      <div className="-mx-3 mb-4 flex gap-1 overflow-x-auto px-3 pb-1 sm:-mx-5 sm:px-5">
        {TABS.map((t) => {
          const active =
            t.href === "/freshie-control"
              ? pathname === "/freshie-control"
              : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold",
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
