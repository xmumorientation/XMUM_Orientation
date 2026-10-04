"use client";

import { CalendarDays, Home, KeyRound, Map, Package, ScanLine } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useProfile } from "@/components/ProfileProvider";

import "./freshie.css";

// Phone tab bar for Freshies and facilitators. Freshies get Scan in the
// center. Facilitators get Code, and Map opens location check-in.
const TABS = [
  { href: "/dashboard", label: "Home", Icon: Home },
  { href: "/inventory", label: "Items", Icon: Package },
  { href: "/map", label: "Map", Icon: Map },
  { href: "/schedule", label: "Schedule", Icon: CalendarDays },
];

export function FreshieTabBar() {
  const pathname = usePathname();
  const profile = useProfile();
  const isFaci = profile.role === "faci";
  const mapHref = isFaci ? "/checkin" : "/map";
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const tabs = TABS.map((tab) => (tab.href === "/map" ? { ...tab, href: mapHref } : tab));

  const tab = ({ href, label, Icon }: (typeof tabs)[number]) => (
    <Link key={href} href={href} className="fh-tab" aria-current={isActive(href) ? "page" : undefined}>
      <Icon size={22} strokeWidth={1.9} aria-hidden />
      {label}
    </Link>
  );

  const CenterIcon = isFaci ? KeyRound : ScanLine;

  return (
    <nav className="fh-tabbar" aria-label={isFaci ? "Facilitator navigation" : "Freshie navigation"}>
      {tabs.slice(0, 2).map(tab)}
      <Link
        href={isFaci ? "/code" : "/scan"}
        className="fh-tab fh-tab-scan"
        aria-label={isFaci ? "Group code" : "Scan a QR code"}
        aria-current={isActive(isFaci ? "/code" : "/scan") ? "page" : undefined}
      >
        <span className="fh-tab-scan-btn" aria-hidden>
          <CenterIcon size={26} strokeWidth={2.2} />
        </span>
        {isFaci ? "Code" : "Scan"}
      </Link>
      {tabs.slice(2).map(tab)}
    </nav>
  );
}
