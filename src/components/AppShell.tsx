"use client";

import { ArrowLeft, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { nexusBody, vxDisplay } from "@/components/home/fonts";
import { FreshieTabBar } from "@/components/freshie/FreshieTabBar";
import { themeFromColor, VORTEXA_THEME } from "@/components/freshie/groupTheme";
import { ShellMenuProvider } from "@/components/ShellMenu";
import { NavIcon } from "@/components/NavIcon";
import { NewItemToast } from "@/components/NewItemToast";
import { OpsHeader } from "@/components/staff/OpsHeader";
import { PhaseTimer } from "@/components/PhaseTimer";
import { FaciLocationBanner } from "@/components/FaciLocationTracker";
import { useConfig } from "@/components/useConfig";
import { useProfile } from "@/components/ProfileProvider";
import { useGroup } from "@/components/useGroup";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import { Monogram } from "@/components/ui/Monogram";
import { TopNav } from "@/components/TopNav";
import { supabaseBrowser } from "@/lib/supabase/client";
import { OPS_ROLES, ROLE_LABELS, VORTEXA_ROLES, type UserRole } from "@/lib/types";
import { cn, hexToRgbChannels } from "@/lib/utils";

import "@/components/staff/staff-dashboard.css";
import "@/components/staff/staff-pages.css";

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

  const isFreshie = profile.role === "freshie";
  const isFaci = profile.role === "faci";
  const isAdmin = profile.role === "admin";
  // HOF, HOGM, Committee: Freshie-style home and tab bar in the Welcome page colours.
  const isOps = OPS_ROLES.includes(profile.role);
  // GM gets the same look; its center tab and yellow pill are Station (/gm).
  const isGm = profile.role === "gm";
  const isVortexa = VORTEXA_ROLES.includes(profile.role);
  const isStaffDashboard = !isFreshie && pathname === "/dashboard";
  // Every Committee, Faci, GM, HOF, HOGM, Guardian GM and Admin page uses the
  // dark staff design. The map and Items pages keep their own design.
  // The ops crew's and GM's map is the Ops page's map, so it gets the same dark design.
  const keepsOwnDesign =
    (!isVortexa && (pathname === "/map" || pathname.startsWith("/map/"))) || pathname.startsWith("/inventory");
  const isStaffArea = !isFreshie && !keepsOwnDesign;
  const isStaffSubpage = isStaffArea && !isStaffDashboard;
  // Roles whose subpages use Home's header (OpsHeader) instead of the staff phone header.
  const hasOpsHeader = profile.role === "hogm" || profile.role === "hof" || isGm;
  const items = NAV.filter((n) => n.roles.includes(profile.role));
  // Freshie and facilitator phones share the night tab bar. Freshie Scan is
  // the raised center button; a facilitator gets Code there instead.
  // Home, Schedule, Items and Map hide the light mobile header for both roles.
  const { group } = useGroup();
  const groupTheme = isFreshie || isFaci ? themeFromColor(group?.color) : null;
  // Only the --fh-* night colours; --brand-1 stays the brand so light pages keep theirs.
  const fhTheme = groupTheme ?? (isVortexa ? VORTEXA_THEME : null);
  const isNight = isStaffDashboard || (
    (isFreshie || isFaci) &&
    (pathname === "/dashboard" || pathname === "/schedule" || pathname === "/inventory" || pathname === "/map"));
  const showTabBar = (isFreshie || isFaci || isVortexa) && !(isFreshie && pathname === "/scan");

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

  const navLinks = (mode: "drawer", iconsOnly = false) =>
    items.map((item) => {
      const active =
        pathname === item.href || pathname.startsWith(item.href + "/");
      return (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active ? "page" : undefined}
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
        // With the tab bar the page itself never scrolls (see .app-scroll below).
        showTabBar ? "h-dvh overflow-hidden" : "min-h-dvh",
        "w-full",
        isNight && (isVortexa ? "bg-[#07060b]" : "bg-[#030b1c]"),
        isStaffArea && `staff-dashboard-shell ${nexusBody.variable} ${vxDisplay.variable}`,
        isStaffArea && isVortexa && "staff-vx"
      )}
      style={
        {
          "--brand-1": groupTheme?.accent ?? brand.brandPrimary,
          "--brand-2": brand.brandSecondary,
          "--brand-1-rgb": hexToRgbChannels(groupTheme?.accent ?? brand.brandPrimary),
          "--brand-2-rgb": hexToRgbChannels(brand.brandSecondary),
          ...(fhTheme
            ? {
                "--fh-accent": fhTheme.accent,
                "--fh-glow": fhTheme.glow,
                "--fh-blue": fhTheme.accent,
                "--fh-blue-light": fhTheme.accentLight,
                "--fh-on-blue": fhTheme.onAccent,
              }
            : {}),
        } as React.CSSProperties
      }
    >

      {/* Freshie / Faci: one screen-high column, header, scroller (.app-scroll),
          then the tab bar in normal flow. The document never scrolls and the
          tab bar is not position: fixed, so iOS Safari cannot leave it mid-screen
          or short of the bottom (seen on iPad, 2026-10-13). */}
      <div className={cn("min-w-0", showTabBar && "flex h-dvh flex-col")}>
      {/* Landscape tablets and desktops: one row of text links (no sidebar). */}
      <TopNav
        items={items.map(({ href, label }) => ({ href, label }))}
        pathname={pathname}
        roleLabel={ROLE_LABELS[profile.role]}
        name={profile.full_name ?? ""}
        groupName={isFreshie || isFaci ? (group?.name ?? null) : null}
        canEditProfile={isFaci}
        primaryHref={isOps ? "/committee" : isGm ? "/gm" : undefined}
        onSignOut={signOut}
      />
      {/* HOGM and HOF subpages: Home's logo, role chip and account menu (OpsHeader). */}
      {isStaffSubpage && hasOpsHeader && <OpsHeader />}
      {!isNight && !(isStaffSubpage && hasOpsHeader) && (
      <header className={cn("sticky top-0 z-40 border-b border-paper-200 bg-paper-50/95 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(28,26,23,0.03)] backdrop-blur lg:hidden", isStaffSubpage && "sp-header")}>
        {isStaffSubpage ? (
          <div className="sp-header-row">
            <Link href="/dashboard" className="sp-back">
              <ArrowLeft size={20} aria-hidden />
              Home
            </Link>
            <div className="sp-header-end">
              <span className="sp-role">{ROLE_LABELS[profile.role]}</span>
              <button type="button" aria-label="Open menu" onClick={() => setMenuOpen(true)} className="sp-menu-btn">
                <Menu size={22} aria-hidden />
              </button>
            </div>
          </div>
        ) : (
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
            className={cn("lg:hidden", isStaffArea && `sd-drawer sd-top-menu ${nexusBody.variable}`, isStaffArea && isVortexa && "staff-vx")}
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

      <div className={showTabBar ? "app-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain" : undefined}>
      <ShellMenuProvider openMenu={() => setMenuOpen(true)}>
      <main
        className={cn(
          "mx-auto w-full px-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-8 sm:pt-5 lg:px-8 lg:py-6",
          // In the tab-bar column the scroller sets the height; min-h-dvh there
          // would make even a short page scroll by the tab bar's height.
          showTabBar ? "min-h-full" : "min-h-dvh",
          isAdmin ? "max-w-[96rem]" : "max-w-6xl",
          // Admin pages already carry their own dark theme (.av).
          isStaffSubpage && !pathname.startsWith("/admin") && "sp",
          // Room for the Scan button, which rises above the tab bar.
          showTabBar && "pb-10 sm:pb-10"
        )}
      >
        {children}
      </main>
      </ShellMenuProvider>
      </div>

      {showTabBar && <FreshieTabBar />}

      <NewItemToast />
      <FaciLocationBanner />
      </div>
    </div>
  );
}
