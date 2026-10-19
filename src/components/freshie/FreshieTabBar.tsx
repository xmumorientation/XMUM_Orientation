"use client";

import { Activity, CalendarDays, Coins, Home, KeyRound, Map, Package, ScanLine, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useProfile } from "@/components/ProfileProvider";
import { OPS_ROLES } from "@/lib/types";

import "./freshie.css";

type Tab = { href: string; label: string; Icon: LucideIcon };

// Phone tab bar for Freshies, facilitators and the ops crew (HOF, HOGM,
// Committee). Freshies get Scan in the center. Facilitators get Code, and Map
// opens location check-in. The ops crew gets Ops (/committee) in the center,
// in yellow (data-variant="ops"), with Scores in place of Items.
const TABS: Tab[] = [
  { href: "/dashboard", label: "Home", Icon: Home },
  { href: "/inventory", label: "Items", Icon: Package },
  { href: "/map", label: "Map", Icon: Map },
  { href: "/schedule", label: "Schedule", Icon: CalendarDays },
];

const OPS_TABS: Tab[] = [
  { href: "/dashboard", label: "Home", Icon: Home },
  { href: "/map", label: "Map", Icon: Map },
  { href: "/token", label: "Scores", Icon: Coins },
  { href: "/schedule", label: "Schedule", Icon: CalendarDays },
];

export function FreshieTabBar() {
  const pathname = usePathname();
  const profile = useProfile();
  const isFaci = profile.role === "faci";
  const isOps = OPS_ROLES.includes(profile.role);
  const mapHref = isFaci ? "/checkin" : "/map";
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const tabs = isOps ? OPS_TABS : TABS.map((tab) => (tab.href === "/map" ? { ...tab, href: mapHref } : tab));
  const center = isOps
    ? { href: "/committee", label: "Ops", aria: "Operations", Icon: Activity }
    : isFaci
      ? { href: "/code", label: "Code", aria: "Group code", Icon: KeyRound }
      : { href: "/scan", label: "Scan", aria: "Scan a QR code", Icon: ScanLine };

  const tab = ({ href, label, Icon }: Tab) => (
    <Link key={href} href={href} className="fh-tab" aria-current={isActive(href) ? "page" : undefined}>
      <Icon size={22} strokeWidth={1.9} aria-hidden />
      {label}
    </Link>
  );

  return (
    <nav
      className="fh-tabbar"
      data-variant={isOps ? "ops" : undefined}
      aria-label={isOps ? "Operations navigation" : isFaci ? "Facilitator navigation" : "Freshie navigation"}
    >
      {tabs.slice(0, 2).map(tab)}
      <Link
        href={center.href}
        className="fh-tab fh-tab-scan"
        aria-label={center.aria}
        aria-current={isActive(center.href) ? "page" : undefined}
      >
        <span className="fh-tab-scan-btn" aria-hidden>
          <center.Icon size={26} strokeWidth={2.2} />
        </span>
        {center.label}
      </Link>
      {tabs.slice(2).map(tab)}
    </nav>
  );
}
