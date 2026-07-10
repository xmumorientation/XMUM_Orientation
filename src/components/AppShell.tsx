"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { NewItemToast } from "@/components/NewItemToast";
import { PhaseTimer } from "@/components/PhaseTimer";
import { useConfig } from "@/components/useConfig";
import { useProfile } from "@/components/ProfileProvider";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ROLE_LABELS, type UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";

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
    href: "/schedule",
    label: "Plan",
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
  { href: "/admin", label: "Admin", code: "AD", roles: ["admin"] },
];

function initials(name: string) {
  const letters = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .replace(/[^a-z]/gi, "")
    .toUpperCase();
  return letters.slice(0, 2) || "VX";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const profile = useProfile();
  const pathname = usePathname();
  const router = useRouter();
  const { brand } = useConfig();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const items = NAV.filter((n) => n.roles.includes(profile.role));
  const mark = initials(brand.eventName);

  // Close the drawer on route change so it never lingers over a new page.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Accessible dialog behaviour: move focus in on open, restore it to the
  // trigger on close, Escape to close, and a simple Tab focus trap.
  useEffect(() => {
    if (!menuOpen) return;
    const trigger = menuButtonRef.current;
    const drawer = drawerRef.current;
    drawer?.querySelector<HTMLElement>(
      'a, button, [tabindex]:not([tabindex="-1"])'
    )?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      if (e.key !== "Tab" || !drawer) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a, button, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [menuOpen]);

  async function signOut() {
    await supabaseBrowser().auth.signOut();
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
              : "text-ink-soft hover:bg-base-100 hover:text-ink"
          )}
        >
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-black tracking-tight",
              active
                ? "bg-white/15 text-white"
                : "bg-star-cyansoft/20 text-star-cyanstrong"
            )}
          >
            {item.code}
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
        } as React.CSSProperties
      }
    >
      <aside className="sticky top-0 hidden h-dvh border-r border-base-200 bg-base-50/95 px-4 py-5 lg:flex lg:flex-col">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ink text-sm font-black text-white shadow-card">
            {mark}
          </span>
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

        <div className="mt-auto space-y-3 border-t border-base-200 pt-4">
          <span className="chip border border-star-cyan/20 bg-star-cyansoft/20 text-star-cyanstrong">
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
      <header className="sticky top-0 z-40 border-b border-base-200 bg-base-50/95 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(28,26,23,0.03)] backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-5 sm:py-3">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-ink text-sm font-black text-white shadow-card">
              {mark}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold tracking-tight">
                {brand.eventName}
              </span>
              <span className="block truncate text-xs text-ink-faint">
                XMUM Orientation 2026
              </span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <span className="chip border border-star-cyan/20 bg-star-cyansoft/20 text-star-cyanstrong">
              {ROLE_LABELS[profile.role]}
            </span>
            <button
              ref={menuButtonRef}
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav-drawer"
              aria-haspopup="dialog"
              className="min-h-[44px] rounded-xl border border-base-300 bg-white px-3 text-sm font-black text-ink shadow-card"
            >
              Menu
            </button>
          </div>
        </div>
        <PhaseTimer />
      </header>

      {menuOpen && (
        <div
          className="fixed inset-0 z-50 bg-ink/35 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] lg:hidden"
          onClick={() => setMenuOpen(false)}
        >
          <div
            ref={drawerRef}
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            onClick={(e) => e.stopPropagation()}
            className="ml-auto flex max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top))] w-full max-w-sm flex-col rounded-[1.75rem] border border-white/80 bg-white p-2 shadow-[0_24px_90px_rgba(28,26,23,0.22)]"
          >
            <div className="flex items-center justify-between gap-3 p-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-ink text-sm font-black text-white">
                  {mark}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{brand.eventName}</p>
                  <p className="truncate text-xs text-ink-faint">
                    {ROLE_LABELS[profile.role]}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className="min-h-[44px] rounded-xl border border-base-300 px-3 text-sm font-bold text-ink-soft"
              >
                Close
              </button>
            </div>

            <nav className="mt-2 flex-1 space-y-1 overflow-y-auto px-1 pb-2">
              {navLinks("drawer")}
            </nav>

            <button
              onClick={signOut}
              className="mt-2 min-h-[48px] rounded-2xl border border-base-300 bg-base-100 px-3 text-left text-sm font-bold text-ink-soft"
            >
              Log out
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto min-h-dvh w-full max-w-6xl px-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-8 sm:pt-5 lg:px-8 lg:py-6">
        {children}
      </main>

      <NewItemToast />
      </div>
    </div>
  );
}
