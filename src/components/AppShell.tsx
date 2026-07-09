"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

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

// Mobile-first bottom navigation, filtered by role. Server-side RLS is the
// real permission boundary; this only controls what's presented.
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const profile = useProfile();
  const pathname = usePathname();
  const router = useRouter();
  const { brand } = useConfig();

  const items = NAV.filter((n) => n.roles.includes(profile.role));

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-lg flex-col"
      style={
        {
          "--brand-1": brand.brandPrimary,
          "--brand-2": brand.brandSecondary,
        } as React.CSSProperties
      }
    >
      <header className="sticky top-0 z-40 border-b border-base-200 bg-base-50/95 shadow-[0_1px_0_rgba(28,26,23,0.03)] backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-ink text-sm font-black text-white shadow-card">
              SR
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
              onClick={signOut}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-ink-faint transition hover:bg-base-200 hover:text-ink"
            >
              Log out
            </button>
          </div>
        </div>
        <PhaseTimer />
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">{children}</main>

      <NewItemToast />

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-base-200 bg-white/95 backdrop-blur">
        <div
          className="mx-auto grid max-w-lg px-1"
          style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}
        >
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "my-1 flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold transition",
                  active
                    ? "bg-star-cyansoft/20 text-star-cyanstrong"
                    : "text-ink-faint hover:bg-base-100 hover:text-ink"
                )}
              >
                <span className="text-[10px] font-black leading-none tracking-tight">
                  {item.code}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}
