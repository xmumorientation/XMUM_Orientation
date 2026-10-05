"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useProfile } from "@/components/ProfileProvider";
import { cn } from "@/lib/utils";

interface Tab {
  href: string;
  label: string;
}

interface Section {
  key: string;
  label: string;
  tabs: Tab[];
}

// Grouped by when an admin needs them: Live during the event, Freshies for
// group setup, Game for the game pieces, Settings for rarely changed things.
const SECTIONS: Section[] = [
  {
    key: "live",
    label: "Live",
    tabs: [
      { href: "/admin", label: "Control room" },
      { href: "/admin/audit", label: "Audit" },
    ],
  },
  {
    key: "freshies",
    label: "Freshies",
    tabs: [
      { href: "/admin/freshies", label: "Groups" },
      { href: "/admin/freshies/sessions", label: "Sessions" },
      { href: "/admin/freshies/headcount", label: "Headcount" },
    ],
  },
  {
    key: "game",
    label: "Game",
    tabs: [
      { href: "/admin/token", label: "Tokens" },
      { href: "/admin/stations", label: "Stations" },
      { href: "/admin/puzzles", label: "Puzzles" },
      { href: "/admin/blindbox", label: "Blind box" },
      { href: "/admin/nfc", label: "NFC" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    tabs: [
      { href: "/admin/users", label: "Users" },
      { href: "/admin/faq", label: "FAQ" },
      { href: "/admin/brand", label: "Brand" },
    ],
  },
];

// "/admin" and "/admin/freshies" are prefixes of other tabs, so they match
// exactly; every other tab also owns its sub-paths.
function isActive(pathname: string, href: string) {
  if (href === "/admin" || href === "/admin/freshies") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

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

  const section =
    SECTIONS.find((s) => s.tabs.some((t) => isActive(pathname, t.href))) ??
    SECTIONS[0];

  return (
    <div>
      <nav aria-label="Admin sections" className="mb-4 space-y-2">
        <div className="-mx-3 flex gap-1 overflow-x-auto px-3 pb-1 sm:-mx-5 sm:px-5 lg:mx-0 lg:px-0">
          {SECTIONS.map((s) => (
            <Link
              key={s.key}
              href={s.tabs[0].href}
              aria-current={s.key === section.key ? "page" : undefined}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold",
                s.key === section.key
                  ? "bg-ink text-white"
                  : "bg-white text-ink-soft shadow-card hover:text-ink"
              )}
            >
              {s.label}
            </Link>
          ))}
        </div>
        <div className="-mx-3 flex gap-1 overflow-x-auto border-b border-paper-200 px-3 sm:-mx-5 sm:px-5 lg:mx-0 lg:px-0">
          {section.tabs.map((t) => {
            const active = isActive(pathname, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold",
                  active
                    ? "border-ink text-ink"
                    : "border-transparent text-ink-faint hover:text-ink"
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
