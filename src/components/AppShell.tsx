"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { HamburgerMenu } from "@/components/HamburgerMenu";
import { NavIcon } from "@/components/NavIcon";
import { AccountStatusNotice } from "@/components/AccountStatusNotice";
import { GroupUpdatesBanner } from "@/components/GroupUpdatesBanner";
import { NewItemToast } from "@/components/NewItemToast";
import { PhaseTimer } from "@/components/PhaseTimer";
import { useConfig } from "@/components/useConfig";
import { useCurrentUserContext, useProfile } from "@/components/ProfileProvider";
import { Monogram } from "@/components/ui/Monogram";
import { ROLE_LABELS } from "@/lib/types";
import { ROLE_NAVIGATION } from "@/lib/navigation";
import { hasPermission } from "@/lib/permissions";
import { cn, hexToRgbChannels } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const profile = useProfile();
  const userContext = useCurrentUserContext();
  const pathname = usePathname();
  const router = useRouter();
  const { brand } = useConfig();
  const items = ROLE_NAVIGATION[profile.role].filter(
    (item) => !item.permission || hasPermission(userContext.permissions, item.permission)
  );
  const pageTitle =
    items.find(
      (item) => pathname === item.href || pathname.startsWith(item.href + "/")
    )?.label ?? brand.eventName;

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const navLinks = () =>
    items.map((item) => {
      const active =
        pathname === item.href || pathname.startsWith(item.href + "/");
      return (
        <Link
          key={item.href}
          href={item.href}
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

        <nav className="mt-5 space-y-1">{navLinks()}</nav>

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
            <HamburgerMenu
              title={ROLE_LABELS[profile.role]}
              items={items}
              onSignOut={signOut}
            />
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
        <GroupUpdatesBanner />
        {children}
      </main>

      <NewItemToast />
      </div>
    </div>
  );
}
