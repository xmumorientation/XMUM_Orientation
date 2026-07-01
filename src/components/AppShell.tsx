"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { NewItemToast } from "@/components/NewItemToast";
import { PhaseTimer } from "@/components/PhaseTimer";
import { useProfile } from "@/components/ProfileProvider";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ROLE_LABELS, type UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles: UserRole[];
}

// Mobile-first bottom navigation, filtered by role. Server-side RLS is the
// real permission boundary; this only controls what's presented.
const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Home",
    icon: "🏠",
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
    icon: "🗺️",
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
  { href: "/inventory", label: "Items", icon: "🎒", roles: ["freshie", "faci"] },
  { href: "/attendance", label: "Roster", icon: "✅", roles: ["faci"] },
  { href: "/gm", label: "Station", icon: "🎮", roles: ["gm", "guardian_gm"] },
  {
    href: "/committee",
    label: "Ops",
    icon: "📡",
    roles: ["hof", "hogm", "committee"],
  },
  { href: "/admin", label: "Admin", icon: "⚙️", roles: ["admin"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const profile = useProfile();
  const pathname = usePathname();
  const router = useRouter();

  const items = NAV.filter((n) => n.roles.includes(profile.role));

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <header className="sticky top-0 z-40 border-b border-base-200 bg-base-50/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-2.5">
          <Link href="/dashboard" className="flex items-center gap-1.5">
            <span className="text-lg">✦</span>
            <span className="text-sm font-bold tracking-tight">
              Starlight Revival
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="chip bg-star-violetsoft/40 text-star-violet">
              {ROLE_LABELS[profile.role]}
            </span>
            <button
              onClick={signOut}
              className="text-xs font-medium text-ink-faint underline"
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
          className="mx-auto grid max-w-lg"
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
                  "flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-star-cyan" : "text-ink-faint"
                )}
              >
                <span className="text-lg leading-none">{item.icon}</span>
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
