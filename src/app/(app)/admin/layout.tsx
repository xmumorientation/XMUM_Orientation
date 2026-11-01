"use client";

import { Gamepad2, Radio, Settings, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { nexusBody, vxDisplay } from "@/components/home/fonts";
import "@/components/staff/staff-dashboard.css";
import "./admin-vortexa.css";
import { usePathname } from "next/navigation";

import { useProfile } from "@/components/ProfileProvider";

interface Tab {
  href: string;
  label: string;
}

interface Section {
  key: string;
  label: string;
  icon: LucideIcon;
  tabs: Tab[];
}

// Grouped by when an admin needs them: Live during the event, Freshies for
// group setup (one page; its Headcount page stays reachable at its URL), Game
// for the game pieces, Settings for rarely changed things.
const SECTIONS: Section[] = [
  {
    key: "live",
    label: "Live",
    icon: Radio,
    tabs: [
      { href: "/admin", label: "Live control" },
      { href: "/admin/audit", label: "Audit" },
    ],
  },
  {
    key: "freshies",
    label: "Freshies",
    icon: Users,
    tabs: [{ href: "/admin/freshies", label: "Groups" }],
  },
  {
    key: "game",
    label: "Game",
    icon: Gamepad2,
    tabs: [
      { href: "/admin/token", label: "Tokens" },
      { href: "/admin/stations", label: "Stations" },
      { href: "/admin/puzzles", label: "Puzzles" },
      { href: "/admin/blindbox", label: "Blind box" },
      { href: "/admin/nfc", label: "NFC" },
      { href: "/admin/funfair", label: "Funfair" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings,
    tabs: [
      { href: "/admin/users", label: "Users" },
      { href: "/admin/faq", label: "FAQ" },
      { href: "/admin/brand", label: "Brand" },
    ],
  },
];

// "/admin" is a prefix of every other tab, so it matches exactly; every other
// tab also owns its sub-paths (so /admin/freshies/headcount stays in Freshies).
function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
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
    <div className={`av ${nexusBody.variable} ${vxDisplay.variable}`}>
      <div className="av-shell">
        {/* Laptop: left sidebar. Phone: floating dock at the bottom. */}
        <nav aria-label="Admin sections" className="av-side">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.key}
                href={s.tabs[0].href}
                aria-current={s.key === section.key ? "page" : undefined}
              >
                <Icon size={20} strokeWidth={1.75} aria-hidden />
                <span>{s.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="av-main">
          {section.tabs.length > 1 && (
            <nav aria-label="Admin pages" className="av-tabs">
              {section.tabs.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={isActive(pathname, t.href) ? "page" : undefined}
                  className="av-tab"
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          )}
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
