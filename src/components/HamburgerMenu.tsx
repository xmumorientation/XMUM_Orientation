"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { NavIcon } from "@/components/NavIcon";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import type { NavigationItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function HamburgerMenu({
  title,
  items,
  onSignOut,
}: {
  title: string;
  items: NavigationItem[];
  onSignOut: () => void | Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button aria-label="Open menu" className="flex h-11 w-11 items-center justify-center rounded-xl border border-paper-300 bg-white text-ink shadow-raised active:scale-95">
          <Menu size={21} />
        </button>
      </DialogTrigger>
      <DialogContent layout="sheet" title={title + " menu"} titleVisuallyHidden showClose={false} className="lg:hidden">
        <div className="flex h-full flex-col">
          <div className="relative flex min-h-[52px] items-center border-b border-paper-200 px-1 pb-3">
            <DialogClose asChild>
              <button aria-label="Close menu" className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-soft hover:bg-paper-100">
                <X size={21} />
              </button>
            </DialogClose>
            <p className="absolute left-1/2 -translate-x-1/2 text-sm font-black uppercase tracking-[0.18em]">{title}</p>
          </div>
          <nav aria-label={title + " navigation"} className="flex-1 space-y-2 overflow-y-auto py-5">
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link key={item.href} href={item.href} className={cn(
                  "flex min-h-[58px] items-center justify-center gap-3 rounded-2xl px-4 text-base font-black uppercase tracking-[0.12em]",
                  active ? "bg-ink text-white shadow-card" : "bg-paper-100 text-ink hover:bg-brand-1/10"
                )}>
                  <NavIcon code={item.code} size={20} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <button onClick={onSignOut} className="min-h-[52px] rounded-xl border border-red-700 bg-red-600 px-4 text-left text-sm font-black text-white shadow-raised transition hover:bg-red-700 active:scale-[0.99]">
            Log out
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
