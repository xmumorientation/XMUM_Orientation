"use client";

import { LogOut, Menu, ScanLine, UserRound, X } from "lucide-react";
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
import { cn, hexToRgbChannels, initialsFrom } from "@/lib/utils";

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

/** Mobile account control. Freshies have no photo field, so the button shows initials. */
function FreshieAccountMenu({
  name,
  onSignOut,
}: {
  name: string;
  onSignOut: () => void;
}) {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const label = name.trim() || "Freshie";

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="fd-account" ref={rootRef}>
      <button
        type="button"
        className="fd-account-btn"
        aria-label={`Account, ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="freshie-account-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden>{initialsFrom(label)}</span>
      </button>
      {open && (
        <div
          id="freshie-account-menu"
          className="fd-account-menu"
          role="menu"
          aria-label="Account"
        >
          <p className="fd-account-name">{label}</p>
          <Link
            href="/profile"
            role="menuitem"
            className="fd-account-item"
            onClick={() => setOpen(false)}
          >
            <UserRound size={16} strokeWidth={1.75} aria-hidden />
            Profile
          </Link>
          <button
            type="button"
            role="menuitem"
            className="fd-account-item fd-account-logout"
            onClick={onSignOut}
          >
            <LogOut size={16} strokeWidth={1.75} aria-hidden />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const profile = useProfile();
  const pathname = usePathname();
  const { brand } = useConfig();
  const [menuOpen, setMenuOpen] = useState(false);
  // The dashboard owns the live group subscription. AppShell only needs the
  // server snapshot here; subscribing a second time would reuse the same
  // Supabase channel and attempt to add a handler after subscribe().
  const group = useInitialGroup();

  const isFreshie = profile.role === "freshie";
  // Freshie /dashboard is a scroll hub inside this shell. Mobile chrome is
  // the logo, a tappable account button, and the bottom nav — no menu
  // drawer. The page's status block already shows the group and the live
  // phase, so this route skips the header's group chip and phase pill.
  const isFreshieDashboard =
    isFreshie && (pathname === "/dashboard" || pathname.startsWith("/dashboard/"));

  const items = NAV.filter((n) => n.roles.includes(profile.role));

  // Close the drawer on route change so it never lingers over a new page.
  // Radix Dialog owns focus-trap/Escape/backdrop-dismiss/focus-return; route
  // change is the one thing it has no opinion on.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

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
          ...(isFreshie
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
          {isFreshie && (
            <Link
              href="/profile"
              className="app-logout flex min-h-[44px] items-center text-sm font-semibold transition"
            >
              Profile
            </Link>
          )}
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
            {!isFreshie && (
            <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
              <DialogTrigger asChild>
                <button
                  aria-label="Open menu"
                  className="app-menu-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition active:scale-95"
                >
                  <Menu size={20} strokeWidth={1.75} />
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
                  <div className="flex items-center justify-between border-b border-[var(--an-line)] px-3 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Monogram name={brand.eventName} size="sm" className="app-monogram" />
                        <div className="min-w-0">
                          <p className="app-brand-title truncate text-sm font-bold">
                            {brand.eventName}
                          </p>
                          <p className="app-brand-sub truncate">
                            {ROLE_LABELS[profile.role]}
                          </p>
                        </div>
                      </div>
                    </div>

                    <DialogClose asChild>
                      <button
                        aria-label="Close menu"
                        className="app-menu-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition active:scale-95"
                      >
                        <X size={18} strokeWidth={1.75} />
                      </button>
                    </DialogClose>
                  </div>

                  <nav className="mt-2 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
                    {navLinks("drawer")}
                  </nav>

                  <div className="mt-auto border-t border-[var(--an-line)] p-2">
                    <button
                      onClick={signOut}
                      className="app-logout-sheet flex w-full min-h-[44px] items-center gap-2.5 rounded-xl px-3 text-left text-sm font-bold transition"
                    >
                      <LogOut size={16} strokeWidth={1.75} />
                      <span>Log out</span>
                    </button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            )}

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
                    alt="Vortexa"
                    width={96}
                    height={55}
                    className="h-6 w-auto object-contain"
                    priority
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
            {isFreshie && !isFreshieDashboard && (
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

            {!isFreshie && (
              <span className="app-role-chip chip">
                {ROLE_LABELS[profile.role]}
              </span>
            )}

            {isFreshie && (
              <FreshieAccountMenu
                name={profile.full_name || "Freshie"}
                onSignOut={signOut}
              />
            )}
          </div>
        </div>
        {!isFreshieDashboard && <PhaseTimer />}
      </header>

      <main
        className={cn(
          "mx-auto min-h-dvh w-full max-w-6xl px-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-8 sm:pt-5 lg:px-8 lg:py-6",
          isFreshie && pathname !== "/scan" && "app-main-freshie-clearance"
        )}
      >
        {children}
      </main>
      </div>

      {/* Mobile Bottom Navigation Bar: Home | Map | Center Scan QR | Items | Schedule */}
      {isFreshie && pathname !== "/scan" && (
        <nav
          aria-label="Mobile navigation"
          className="app-bottom-nav fixed bottom-0 inset-x-0 z-50 lg:hidden"
        >
          <div className="app-bottom-nav-inner">
            <Link
              href="/dashboard"
              className={cn(
                "app-bottom-nav-item",
                (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) && "is-active"
              )}
            >
              <NavIcon code="HM" size={19} strokeWidth={1.75} />
              <span>Home</span>
            </Link>

            <Link
              href="/map"
              className={cn(
                "app-bottom-nav-item",
                (pathname === "/map" || pathname.startsWith("/map/")) && "is-active"
              )}
            >
              <NavIcon code="MP" size={19} strokeWidth={1.75} />
              <span>Map</span>
            </Link>

            <div className="app-bottom-nav-center">
              <Link
                href="/scan"
                aria-label="Scan QR Code"
                className="app-bottom-scan-btn"
              >
                <span className="app-bottom-scan-icon">
                  <ScanLine size={22} strokeWidth={2} />
                </span>
                <span className="app-bottom-scan-text">Scan</span>
              </Link>
            </div>

            <Link
              href="/inventory"
              className={cn(
                "app-bottom-nav-item",
                (pathname === "/inventory" || pathname.startsWith("/inventory/")) && "is-active"
              )}
            >
              <NavIcon code="IT" size={19} strokeWidth={1.75} />
              <span>Items</span>
            </Link>

            <Link
              href="/schedule"
              className={cn(
                "app-bottom-nav-item",
                (pathname === "/schedule" || pathname.startsWith("/schedule/")) && "is-active"
              )}
            >
              <NavIcon code="PL" size={19} strokeWidth={1.75} />
              <span>Schedule</span>
            </Link>
          </div>
        </nav>
      )}

      <NewItemToast />
    </div>
  );
}
