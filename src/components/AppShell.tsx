"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { NavIcon } from "@/components/NavIcon";
import { AccountStatusNotice } from "@/components/AccountStatusNotice";
import { NewItemToast } from "@/components/NewItemToast";
import { PhaseTimer } from "@/components/PhaseTimer";
import { useConfig } from "@/components/useConfig";
import { useCurrentUserContext, useProfile } from "@/components/ProfileProvider";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Monogram } from "@/components/ui/Monogram";
import { ROLE_LABELS } from "@/lib/types";
import { hasAnyPermission, type Permission } from "@/lib/permissions";
import { cn, hexToRgbChannels } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  code: string;
  permissions?: Permission[];
}

// Responsive navigation, filtered by role. Server-side RLS is the real
// permission boundary; this only controls what's presented.
const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Home",
    code: "HM",
    permissions: ["dashboard.view"],
  },
  {
    href: "/map",
    label: "Map",
    code: "MP",
    permissions: ["map.view"],
  },
  { href: "/inventory", label: "Items", code: "IT", permissions: ["inventory.view"] },
  { href: "/attendance", label: "Roster", code: "AT", permissions: ["attendance.manage"] },
  { href: "/gm", label: "Day 1 / Day 2", code: "GM", permissions: ["gameplay.day1", "gameplay.day2"] },
  { href: "/token", label: "Token System", code: "TK", permissions: ["token.view", "token.play", "token.manage"] },
  { href: "/guardian", label: "Puzzle verify", code: "VG", permissions: ["gameplay.puzzle_verify"] },
  { href: "/lighting", label: "Lighting Zone", code: "LZ", permissions: ["lighting.view"] },
  {
    href: "/schedule",
    label: "Schedule",
    code: "PL",
    permissions: ["dashboard.view"],
  },
  { href: "/faq", label: "FAQ", code: "FQ", permissions: ["dashboard.view"] },
  {
    href: "/admin/operations",
    label: "Ops",
    code: "OP",
    permissions: ["operations.manage"],
  },
  {
    href: "/bigscreen",
    label: "Big screen",
    code: "BS",
    permissions: ["admin.access"],
  },
  {
    href: "/booking",
    label: "Booking",
    code: "BK",
    permissions: ["dashboard.view"],
  },
  {
    href: "/reservations",
    label: "Reservations",
    code: "RS",
    permissions: ["dashboard.view"],
  },
  {
    href: "/register-counter",
    label: "Counter",
    code: "RC",
    permissions: ["accounts.manage"],
  },
  { href: "/admin", label: "Admin", code: "AD", permissions: ["admin.access"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const profile = useProfile();
  const userContext = useCurrentUserContext();
  const pathname = usePathname();
  const router = useRouter();
  const { brand } = useConfig();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = NAV.filter(
    (item) =>
      !item.permissions ||
      hasAnyPermission(userContext.permissions, item.permissions)
  );
  const pageTitle =
    items.find(
      (item) => pathname === item.href || pathname.startsWith(item.href + "/")
    )?.label ?? brand.eventName;

  // Close the drawer on route change so it never lingers over a new page.
  // Radix Dialog owns focus-trap/Escape/backdrop-dismiss/focus-return; route
  // change is the one thing it has no opinion on.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
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
            "flex min-h-[48px] items-center gap-3 rounded-2xl px-3 text-sm font-bold transition",
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
          <span>{item.label}</span>
        </Link>
      );
    });

  return (
    <div
      className="min-h-dvh w-full lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]"
      style={
        {
          "--brand-1": brand.brandPrimary,
          "--brand-2": brand.brandSecondary,
          "--brand-1-rgb": hexToRgbChannels(brand.brandPrimary),
          "--brand-2-rgb": hexToRgbChannels(brand.brandSecondary),
        } as React.CSSProperties
      }
    >
      <aside className="sticky top-0 hidden h-dvh border-r border-paper-200 bg-paper-50/95 px-4 py-5 lg:flex lg:flex-col">
        <Link href="/dashboard" className="flex items-center gap-3">
          <Monogram name={brand.eventName} />
          <span className="min-w-0">
            <span className="block truncate text-base font-black tracking-tight">
              {brand.eventName}
            </span>
            <span className="block truncate text-xs text-ink-faint">
              XMUM Orientation 2026
            </span>
          </span>
        </Link>

        <div className="mt-5">
          <PhaseTimer compact />
        </div>

        <nav className="mt-5 space-y-1">{navLinks("sidebar")}</nav>

        <div className="mt-auto space-y-3 border-t border-paper-200 pt-4">
          <span className="chip border border-brand-1/20 bg-brand-1/20 text-brand-1">
            {ROLE_LABELS[profile.role]}
          </span>
          <button
            onClick={signOut}
            className="flex min-h-[44px] items-center text-sm font-semibold text-ink-faint transition hover:text-ink"
          >
            Log out
          </button>
        </div>
      </aside>

      <div className="min-w-0">
      <header className="sticky top-0 z-40 border-b border-paper-200 bg-paper-50/95 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(28,26,23,0.03)] backdrop-blur lg:hidden">
        <div className="relative flex items-center justify-between gap-3 px-3 py-2.5 sm:px-5 sm:py-3">
          <div className="flex shrink-0 items-center">
            <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
              <DialogTrigger asChild>
                <button
                  aria-label="Open menu"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-paper-300 bg-white text-ink shadow-raised transition hover:bg-paper-100 active:scale-95"
                >
                  <Menu size={20} strokeWidth={1.75} />
                </button>
              </DialogTrigger>
              <DialogContent
                layout="sheet"
                title="Navigation menu"
                titleVisuallyHidden
                showClose={false}
                className="lg:hidden"
              >
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-between gap-3 p-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <DialogClose asChild>
                        <button
                          aria-label="Close menu"
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-paper-300 text-ink-soft transition hover:bg-paper-100 hover:text-ink active:scale-95"
                        >
                          <X size={20} strokeWidth={1.75} />
                        </button>
                      </DialogClose>
                      <div className="flex min-w-0 items-center gap-2">
                        <Monogram name={brand.eventName} size="sm" />
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

          </div>

          <p className="pointer-events-none absolute left-1/2 max-w-[45vw] -translate-x-1/2 truncate text-center text-sm font-bold tracking-tight text-ink">
            {pageTitle}
          </p>

          <div className="flex shrink-0 items-center gap-2">
            <span className="chip border border-brand-1/20 bg-brand-1/20 text-brand-1">
              {ROLE_LABELS[profile.role]}
            </span>
          </div>
        </div>
        <PhaseTimer />
      </header>

      <main className="mx-auto min-h-dvh w-full max-w-6xl px-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-8 sm:pt-5 lg:px-8 lg:py-6">
        <AccountStatusNotice />
        {children}
      </main>

      <NewItemToast />
      </div>
    </div>
  );
}
