"use client";

import { LogOut, Menu, ScanLine, User, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { NavIcon } from "@/components/NavIcon";
import { NewItemToast } from "@/components/NewItemToast";
import { PhaseTimer } from "@/components/PhaseTimer";
import { useConfig } from "@/components/useConfig";
import { useInitialGroup, useProfile } from "@/components/ProfileProvider";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Monogram } from "@/components/ui/Monogram";
import { nexusBody } from "@/components/home/fonts";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ROLE_LABELS, type UserRole } from "@/lib/types";
import { cn, hexToRgbChannels } from "@/lib/utils";

import "./app-neon.css";

interface NavItem {
  href: string;
  label: string;
  code: string;
  roles: UserRole[];
}

// Responsive navigation, filtered by role. Server-side RLS is the real
// permission boundary; this only controls what's presented.
const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Home",
    code: "HM",
    roles: [
      "freshie",
      "faci",
      "gm",
      "guardian_gm",
      "hof",
      "hogm",
      "committee",
      "admin",
    ],
  },
  // Web QR scanner (blind boxes). Mobile also gets a floating button below.
  { href: "/scan", label: "Scan", code: "SC", roles: ["freshie"] },
  {
    href: "/map",
    label: "Map",
    code: "MP",
    roles: [
      "freshie",
      "faci",
      "gm",
      "guardian_gm",
      "hof",
      "hogm",
      "committee",
      "admin",
    ],
  },
  { href: "/inventory", label: "Items", code: "IT", roles: ["freshie", "faci"] },
  { href: "/attendance", label: "Roster", code: "AT", roles: ["faci"] },
  { href: "/gm", label: "Station", code: "GM", roles: ["gm", "guardian_gm"] },
  {
    href: "/token",
    label: "Token System",
    code: "TK",
    roles: [
      "gm",
      "guardian_gm",
      "faci",
      "hof",
      "hogm",
      "committee",
    ],
  },
  {
    href: "/schedule",
    label: "Schedule",
    code: "PL",
    roles: [
      "freshie",
      "faci",
      "gm",
      "guardian_gm",
      "hof",
      "hogm",
      "committee",
      "admin",
    ],
  },
  { href: "/faq", label: "FAQ", code: "FQ", roles: ["freshie"] },
  {
    href: "/committee",
    label: "Ops",
    code: "OP",
    roles: ["hof", "hogm", "committee"],
  },
  {
    href: "/bigscreen",
    label: "Big screen",
    code: "BS",
    roles: ["hof", "hogm", "committee", "admin"],
  },
  {
    href: "/booking",
    label: "Booking",
    code: "BK",
    roles: ["hof", "hogm", "faci", "gm", "committee", "admin"],
  },
  {
    href: "/reservations",
    label: "Reservations",
    code: "RS",
    roles: ["faci", "gm", "committee", "admin"],
  },
  {
    href: "/register-counter",
    label: "Freshies Register Counter",
    code: "RC",
    roles: ["admin"],
  },


  { href: "/admin", label: "Admin", code: "AD", roles: ["admin"] },
];

const GROUP_ACCENTS = [
  "#00cfff",
  "#d966ff",
  "#ff3cac",
  "#39ff14",
  "#f9d342",
  "#ff6b35",
] as const;

function groupAccent(groupId: number | null | undefined): string {
  if (!groupId || groupId < 1) return GROUP_ACCENTS[0];
  return GROUP_ACCENTS[(groupId - 1) % GROUP_ACCENTS.length];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const profile = useProfile();
  const pathname = usePathname();
  const { brand } = useConfig();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  // The dashboard owns the live group subscription. AppShell only needs the
  // server snapshot here; subscribing a second time would reuse the same
  // Supabase channel and attempt to add a handler after subscribe().
  const group = useInitialGroup();

  const isFreshie = profile.role === "freshie";
  // Single chrome layer on Freshie /dashboard: compact AppShell bar owns menu+logo+account;
  // FreshieDashboard no longer renders a second fd-top strip.
  const isFreshieDashboard =
    isFreshie && (pathname === "/dashboard" || pathname.startsWith("/dashboard/"));

  const items = NAV.filter((n) => n.roles.includes(profile.role));
  // Floating Scan button: Freshies only, phones/tablets only, hidden on the
  // scanner itself (which is full-screen).
  const showScanFab = isFreshie && pathname !== "/scan";

  // Close the drawer on route change so it never lingers over a new page.
  // Radix Dialog owns focus-trap/Escape/backdrop-dismiss/focus-return; route
  // change is the one thing it has no opinion on.
  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!accountOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!accountRef.current?.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAccountOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    window.location.href = "/login";
  }

  const navLinks = (mode: "sidebar" | "drawer") =>
    items.map((item) => {
      const active =
        pathname === item.href || pathname.startsWith(item.href + "/");
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => mode === "drawer" && setMenuOpen(false)}
          className={cn(
            "app-nav-link flex min-h-[48px] items-center gap-3 px-3 text-sm font-bold transition",
            active && "is-active"
          )}
        >
          <span
            className={cn(
              "app-nav-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors"
            )}
          >
            <NavIcon code={item.code} size={18} strokeWidth={1.75} />
          </span>
          <span>{item.label}</span>
        </Link>
      );
    });

  return (
    <div
      className={cn(
        "app-neon min-h-dvh w-full lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]",
        isFreshieDashboard && "app-neon--fd-dash",
        nexusBody.variable
      )}
      style={
        {
          "--brand-1": brand.brandPrimary,
          "--brand-2": brand.brandSecondary,
          "--brand-1-rgb": hexToRgbChannels(brand.brandPrimary),
          "--brand-2-rgb": hexToRgbChannels(brand.brandSecondary),
          ...(isFreshieDashboard
            ? { "--fd-accent": groupAccent(group?.id ?? profile.group_id) }
            : {}),
        } as React.CSSProperties
      }
    >
      <aside className="app-aside sticky top-0 hidden h-dvh border-r px-4 py-5 lg:flex lg:flex-col">
        <Link href="/dashboard" className="flex items-center gap-3">
          {isFreshie ? (
            <span className="app-brand-logo app-brand-logo--aside">
              <Image
                src="/vortexa-logo-sm.webp"
                alt="Vortexa"
                width={320}
                height={184}
                priority
                style={{ width: "auto" }}
              />
            </span>
          ) : (
            <>
              <Monogram name={brand.eventName} className="app-monogram" />
              <span className="min-w-0">
                <span className="app-brand-title block truncate text-base tracking-tight">
                  {brand.eventName}
                </span>
                <span className="app-brand-sub block truncate">
                  XMUM Orientation 2026
                </span>
              </span>
            </>
          )}
        </Link>

        <div className="mt-5">
          <PhaseTimer compact />
        </div>

        <nav className="mt-5 space-y-1">{navLinks("sidebar")}</nav>

        <div className="mt-auto space-y-3 border-t border-[var(--an-line)] pt-4">
          <span className="app-role-chip chip">
            {ROLE_LABELS[profile.role]}
          </span>
          <button
            onClick={signOut}
            className="app-logout flex min-h-[44px] items-center text-sm font-semibold transition"
          >
            Log out
          </button>
        </div>
      </aside>

      <div className="app-main-wrap min-w-0">
      <header
        className={cn(
          "app-header sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)] lg:hidden",
          isFreshie && "app-header--freshie",
          isFreshieDashboard && "app-header--fd"
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2",
            isFreshieDashboard && "app-header-row--fd"
          )}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
              <DialogTrigger asChild>
                <button
                  aria-label="Open menu"
                  className="app-menu-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition active:scale-95"
                >
                  <Menu size={isFreshie ? 18 : 20} strokeWidth={1.75} />
                </button>
              </DialogTrigger>
              <DialogContent
                layout="sheet"
                title="Navigation menu"
                titleVisuallyHidden
                showClose={false}
                className="app-neon-drawer lg:hidden"
              >
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-between gap-3 p-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <DialogClose asChild>
                        <button
                          aria-label="Close menu"
                          className="app-menu-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition active:scale-95"
                        >
                          <X size={20} strokeWidth={1.75} />
                        </button>
                      </DialogClose>
                      <div className="flex min-w-0 items-center gap-2">
                        {isFreshie ? (
                          <span className="app-brand-logo">
                            <Image
                              src="/vortexa-logo-sm.webp"
                              alt=""
                              width={320}
                              height={184}
                              style={{ width: "auto" }}
                            />
                          </span>
                        ) : (
                          <Monogram name={brand.eventName} size="sm" className="app-monogram" />
                        )}
                        <div className="min-w-0">
                          <p className="app-brand-title truncate text-sm font-bold">
                            {isFreshie ? "Vortexa" : brand.eventName}
                          </p>
                          <p className="app-brand-sub truncate">
                            {ROLE_LABELS[profile.role]}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <nav className="mt-2 flex-1 space-y-1 overflow-y-auto px-1 pb-2">
                    {navLinks("drawer")}
                  </nav>

                  <button
                    onClick={signOut}
                    className="app-logout-sheet mt-2 min-h-[48px] rounded-xl px-3 text-left text-sm font-bold"
                  >
                    Log out
                  </button>
                </div>
              </DialogContent>
            </Dialog>

            <Link
              href="/dashboard"
              className={cn(
                "flex min-w-0 items-center gap-2",
                isFreshie && "app-brand-link"
              )}
              aria-label="Vortexa home"
            >
              {isFreshie ? (
                <span className="app-brand-logo">
                  <Image
                    src="/vortexa-logo-sm.webp"
                    alt=""
                    width={320}
                    height={184}
                    priority
                    style={{ width: "auto" }}
                  />
                </span>
              ) : (
                <>
                  <Monogram name={brand.eventName} size="sm" className="app-monogram" />
                  <span className="min-w-0">
                    <span className="app-brand-title block truncate text-sm tracking-tight">
                      {brand.eventName}
                    </span>
                    <span className="app-brand-sub block truncate">
                      XMUM Orientation 2026
                    </span>
                  </span>
                </>
              )}
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {isFreshieDashboard && (
              <div className="fd-shell-group" aria-live="polite">
                <span
                  className="fd-dot"
                  style={{ background: groupAccent(group?.id ?? profile.group_id) }}
                  aria-hidden
                />
                <span className="fd-shell-group-name">
                  {group ? group.name : "No group"}
                </span>
              </div>
            )}

            {isFreshie ? (
              <div className="app-account" ref={accountRef}>
                <button
                  type="button"
                  className="app-account-btn"
                  aria-label="Account menu"
                  aria-expanded={accountOpen}
                  aria-haspopup="menu"
                  onClick={() => setAccountOpen((v) => !v)}
                >
                  <User size={16} strokeWidth={2} />
                </button>
                {accountOpen && (
                  <div className="app-account-menu" role="menu">
                    <p className="app-account-name">
                      {profile.full_name || "Freshie"}
                    </p>
                    <p className="app-account-meta">{ROLE_LABELS[profile.role]}</p>
                    <button
                      type="button"
                      role="menuitem"
                      className="app-account-logout"
                      onClick={() => void signOut()}
                    >
                      <LogOut size={14} strokeWidth={2} />
                      Log out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <span className="app-role-chip chip">
                {ROLE_LABELS[profile.role]}
              </span>
            )}
          </div>
        </div>
        <PhaseTimer />
      </header>

      <main
        className={cn(
          "mx-auto min-h-dvh w-full max-w-6xl px-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-8 sm:pt-5 lg:px-8 lg:py-6",
          isFreshieDashboard && "pt-2 sm:pt-3",
          showScanFab &&
            "pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:pb-[calc(6.5rem+env(safe-area-inset-bottom))]"
        )}
      >
        {children}
      </main>

      {showScanFab && (
        <Link
          href="/scan"
          aria-label="Scan a QR code"
          className="app-scan-fab-wrap fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-1 lg:hidden"
        >
          <span className="app-scan-fab flex h-16 w-16 items-center justify-center rounded-full transition active:scale-95">
            <ScanLine size={28} strokeWidth={2} />
          </span>
          <span className="app-scan-label rounded-full px-2 text-xs font-bold">Scan</span>
        </Link>
      )}

      <NewItemToast />
      </div>
    </div>
  );
}
