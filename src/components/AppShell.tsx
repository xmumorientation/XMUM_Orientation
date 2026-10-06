"use client";

import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { nexusBody } from "@/components/home/fonts";
import { FreshieTabBar } from "@/components/freshie/FreshieTabBar";
import { themeFromColor } from "@/components/freshie/groupTheme";
import { ShellMenuProvider } from "@/components/ShellMenu";
import { NavIcon } from "@/components/NavIcon";
import { NewItemToast } from "@/components/NewItemToast";
import { PhaseTimer } from "@/components/PhaseTimer";
import { useConfig } from "@/components/useConfig";
import { useProfile } from "@/components/ProfileProvider";
import { useGroup } from "@/components/useGroup";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import { Monogram } from "@/components/ui/Monogram";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ROLE_LABELS, type UserRole } from "@/lib/types";
import { cn, hexToRgbChannels } from "@/lib/utils";

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
  { href: "/gm", label: "Station", code: "GM", roles: ["gm", "guardian_gm"] },
  {
    href: "/token",
    label: "Scoreboard",
    code: "TK",
    roles: ["gm", "guardian_gm", "hof", "hogm", "committee"],
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
  { href: "/code", label: "Code", code: "CD", roles: ["faci"] },
  { href: "/admin", label: "Admin", code: "AD", roles: ["admin"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const profile = useProfile();
  const pathname = usePathname();
  const { brand } = useConfig();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const isFreshie = profile.role === "freshie";
  const isFaci = profile.role === "faci";
  const isAdmin = profile.role === "admin";
  const isStaffDashboard = !isFreshie && pathname === "/dashboard";
  const isStaffArea = isStaffDashboard || (isAdmin && pathname.startsWith("/admin"));
  // Only the admin account can shrink the sidebar to icons.
  const slim = isAdmin && collapsed;
  const items = NAV.filter((n) => n.roles.includes(profile.role)).map((item) =>
    isFaci && item.href === "/map" ? { ...item, href: "/checkin" } : item
  );
  // Freshie and facilitator phones share the night tab bar. Freshie Scan is
  // the raised center button; a facilitator gets Code there instead.
  // Home, Schedule and Items hide the light mobile header for both roles.
  const { group } = useGroup();
  const groupTheme = isFreshie || isFaci ? themeFromColor(group?.color) : null;
  const isNight = isStaffDashboard || (
    (isFreshie || isFaci) &&
    (pathname === "/dashboard" || pathname === "/schedule" || pathname === "/inventory"));
  const showTabBar = (isFreshie || isFaci) && !(isFreshie && pathname === "/scan");

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebar-collapsed") === "1");
    } catch {}
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem("sidebar-collapsed", c ? "0" : "1");
      } catch {}
      return !c;
    });
  }

  // Close the drawer on route change so it never lingers over a new page.
  // Radix Dialog owns focus-trap/Escape/backdrop-dismiss/focus-return; route
  // change is the one thing it has no opinion on.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    window.location.href = isFreshie ? "/" : "/login";
  }

  const navLinks = (mode: "sidebar" | "drawer", iconsOnly = false) =>
    items.map((item) => {
      const active =
        pathname === item.href || pathname.startsWith(item.href + "/");
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => mode === "drawer" && setMenuOpen(false)}
          title={iconsOnly ? item.label : undefined}
          aria-label={iconsOnly ? item.label : undefined}
          className={cn(
            "flex min-h-[48px] items-center gap-3 rounded-2xl px-3 text-sm font-bold transition",
            iconsOnly && "justify-center px-0",
            active
              ? "bg-ink text-white shadow-card"
              : "text-ink-soft hover:bg-paper-100 hover:text-ink"
          )}
        >
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
              active
                ? "bg-white/15 text-white"
                : "bg-brand-1/20 text-brand-1"
            )}
          >
            <NavIcon code={item.code} size={18} strokeWidth={1.75} />
          </span>
          {!iconsOnly && <span>{item.label}</span>}
        </Link>
      );
    });

  return (
    <div
      className={cn(
        "min-h-dvh w-full lg:grid",
        slim ? "lg:grid-cols-[4.5rem_minmax(0,1fr)]" : "lg:grid-cols-[16rem_minmax(0,1fr)]",
        isNight && "bg-[#030b1c]",
        isStaffArea && `staff-dashboard-shell ${nexusBody.variable}`
      )}
      style={
        {
          "--brand-1": groupTheme?.accent ?? brand.brandPrimary,
          "--brand-2": brand.brandSecondary,
          "--brand-1-rgb": hexToRgbChannels(groupTheme?.accent ?? brand.brandPrimary),
          "--brand-2-rgb": hexToRgbChannels(brand.brandSecondary),
          ...(groupTheme
            ? {
                "--fh-accent": groupTheme.accent,
                "--fh-glow": groupTheme.glow,
                "--fh-blue": groupTheme.accent,
                "--fh-blue-light": groupTheme.accentLight,
                "--fh-on-blue": groupTheme.onAccent,
              }
            : {}),
        } as React.CSSProperties
      }
    >
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh border-r border-paper-200 bg-paper-50/95 py-5 lg:flex lg:flex-col",
          slim ? "px-2" : "px-4"
        )}
      >
        <Link
          href="/dashboard"
          title={slim ? brand.eventName : undefined}
          className={cn("flex items-center gap-3", slim && "justify-center")}
        >
          <Monogram name={brand.eventName} />
          {!slim && (
            <span className="min-w-0">
              <span className="block truncate text-base font-black tracking-tight">
                {brand.eventName}
              </span>
              <span className="block truncate text-xs text-ink-faint">
                XMUM 26/12 Orientation
              </span>
            </span>
          )}
        </Link>

        {!slim && (
          <div className="mt-5">
            <PhaseTimer compact />
          </div>
        )}

        <nav className="mt-5 space-y-1">{navLinks("sidebar", slim)}</nav>

        <div
          className={cn(
            "mt-auto space-y-3 border-t border-paper-200 pt-4",
            slim && "flex flex-col items-center"
          )}
        >
          {isAdmin && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={slim ? "Expand sidebar" : "Collapse sidebar"}
              title={slim ? "Expand sidebar" : "Collapse sidebar"}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-paper-300 bg-white text-ink-soft transition hover:bg-paper-100 hover:text-ink"
            >
              {slim ? (
                <PanelLeftOpen size={18} strokeWidth={1.75} />
              ) : (
                <PanelLeftClose size={18} strokeWidth={1.75} />
              )}
            </button>
          )}
          {!slim && (
            <span className="chip border border-brand-1/20 bg-brand-1/20 text-brand-1">
              {ROLE_LABELS[profile.role]}
            </span>
          )}
          <button
            onClick={signOut}
            title="Log out"
            className="flex min-h-[44px] items-center text-sm font-semibold text-ink-faint transition hover:text-ink"
          >
            {slim ? "Exit" : "Log out"}
          </button>
        </div>
      </aside>

      <div className="min-w-0">
      {!isNight && (
      <header className="sticky top-0 z-40 border-b border-paper-200 bg-paper-50/95 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(28,26,23,0.03)] backdrop-blur lg:hidden">
        {isStaffArea ? <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-5 sm:py-3">
          <Link href="/dashboard" className="font-semibold">Vortexa</Link>
          <div className="flex items-center gap-2"><span className="text-sm">{ROLE_LABELS[profile.role]}</span><button type="button" aria-label="Open menu" onClick={() => setMenuOpen(true)} className="flex h-11 w-11 items-center justify-center"><Menu size={20} aria-hidden /></button></div>
        </div> : (
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-5 sm:py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {!isFreshie && (
                <button
                  type="button"
                  aria-label="Open menu"
                  onClick={() => setMenuOpen(true)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-paper-300 bg-white text-ink shadow-raised transition hover:bg-paper-100 active:scale-95"
                >
                  <Menu size={20} strokeWidth={1.75} />
                </button>
            )}

            <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
              <Monogram name={brand.eventName} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold tracking-tight">
                  {brand.eventName}
                </span>
                <span className="block truncate text-xs text-ink-faint">
                  XMUM 26/12 Orientation
                </span>
              </span>
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="chip border border-brand-1/20 bg-brand-1/20 text-brand-1">
              {ROLE_LABELS[profile.role]}
            </span>
          </div>
        </div>
        )}
        <PhaseTimer />
      </header>
      )}

      {!isFreshie && (
        <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
          <DialogContent
            layout={isStaffArea ? "sheetTop" : "sheet"}
            title="Navigation menu"
            titleVisuallyHidden
            showClose={false}
            className={cn("lg:hidden", isStaffArea && "sd-drawer sd-top-menu")}
            overlayClassName={isStaffArea ? "sd-menu-overlay" : undefined}
          >
            <div className={cn("flex flex-col", !isStaffArea && "h-full")}>
              <div className="flex items-center justify-between gap-3 p-2">
                <div className={cn("flex min-w-0 items-center gap-2.5", isStaffArea && "sd-menu-heading")}>
                  <DialogClose asChild>
                    <button
                      aria-label="Close menu"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-paper-300 text-ink-soft transition hover:bg-paper-100 hover:text-ink active:scale-95"
                    >
                      <X size={20} strokeWidth={1.75} />
                    </button>
                  </DialogClose>
                  <div className="flex min-w-0 items-center gap-2">
                    {!isStaffArea && <Monogram name={brand.eventName} size="sm" />}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">
                        {brand.eventName}
                      </p>
                      <p className="truncate text-xs text-ink-faint">
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
                className="mt-2 min-h-[48px] rounded-xl border border-paper-300 bg-paper-100 px-3 text-left text-sm font-bold text-ink-soft"
              >
                Log out
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <ShellMenuProvider openMenu={() => setMenuOpen(true)}>
      <main
        className={cn(
          "mx-auto min-h-dvh w-full px-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-8 sm:pt-5 lg:px-8 lg:py-6",
          isAdmin ? "max-w-[96rem]" : "max-w-6xl",
          showTabBar &&
            "pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:pb-[calc(6.5rem+env(safe-area-inset-bottom))]"
        )}
      >
        {children}
      </main>
      </ShellMenuProvider>

      {showTabBar && <FreshieTabBar />}

      <NewItemToast />
      </div>
    </div>
  );
}
