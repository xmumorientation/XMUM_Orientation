"use client";

import { CalendarDays, Home, Map, Package, ScanLine } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import "./freshie.css";

// Freshie-only bottom tab bar (phones/tablets). Rendered by AppShell for the
// Freshie role only, on every Freshie page except the full-screen /scan.
// Replaces the ☰ drawer for Freshies; staff roles keep their drawer.
const TABS = [
  { href: "/dashboard", label: "Home", Icon: Home },
  { href: "/inventory", label: "Items", Icon: Package },
  { href: "/map", label: "Map", Icon: Map },
  { href: "/schedule", label: "Schedule", Icon: CalendarDays },
];

export function FreshieTabBar() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const tab = ({ href, label, Icon }: (typeof TABS)[number]) => (
    <Link key={href} href={href} className="fh-tab" aria-current={isActive(href) ? "page" : undefined}>
      <Icon size={22} strokeWidth={1.9} aria-hidden />
      {label}
    </Link>
  );

  return (
    <nav className="fh-tabbar" aria-label="Freshie navigation">
      {TABS.slice(0, 2).map(tab)}
      <Link href="/scan" className="fh-tab fh-tab-scan" aria-label="Scan a QR code">
        <span className="fh-tab-scan-btn" aria-hidden>
          <ScanLine size={26} strokeWidth={2.2} />
        </span>
        Scan
      </Link>
      {TABS.slice(2).map(tab)}
    </nav>
  );
}
