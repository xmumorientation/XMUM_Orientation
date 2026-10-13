"use client";

import { Pencil } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { FaciAvatar } from "@/components/freshie/ProfileEditor";
import { PhaseTimer } from "@/components/PhaseTimer";

import "./topnav.css";

/** Fired on /dashboard to open a Faci's profile editor (FreshieHome listens). */
export const EDIT_PROFILE_EVENT = "vortexa:edit-profile";

export type TopNavItem = { href: string; label: string };

/**
 * Landscape tablets and desktops (≥1024px): one row of text links instead of
 * the old sidebar, in the public Welcome page's style. Logo left, the role's
 * links in the middle (current page underlined in the accent), live phase,
 * role and an account menu on the right. Phones keep their own navigation.
 */
export function TopNav({
  items,
  pathname,
  roleLabel,
  name,
  groupName,
  canEditProfile,
  primaryHref,
  onSignOut,
}: {
  items: TopNavItem[];
  pathname: string;
  roleLabel: string;
  name: string;
  groupName: string | null;
  canEditProfile: boolean;
  /** This link shows as a yellow pill (the ops crew's Ops), like the tab bar's center button. */
  primaryHref?: string;
  onSignOut: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  function editProfile() {
    setOpen(false);
    if (pathname === "/dashboard") window.dispatchEvent(new Event(EDIT_PROFILE_EVENT));
    else router.push("/dashboard?edit=profile");
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="vx-topnav">
      <Link href="/dashboard" className="vx-topnav-logo" aria-label="Vortexa, home">
        <Image src="/vortexa-logo-sm.webp" alt="" width={320} height={184} priority style={{ width: "auto" }} />
      </Link>

      <nav className="vx-topnav-links" aria-label="Main">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={item.href === primaryHref ? "vx-topnav-link vx-topnav-link-primary" : "vx-topnav-link"}
            aria-current={isActive(item.href) ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="vx-topnav-end">
        <PhaseTimer compact />
        <span className="vx-topnav-role">{roleLabel}</span>
        <div ref={ref} className="vx-topnav-account">
          <button
            type="button"
            className="vx-topnav-avatar"
            aria-label="Account"
            aria-expanded={open}
            aria-controls="vx-topnav-menu"
            onClick={() => setOpen(!open)}
          >
            <FaciAvatar name={name || roleLabel} avatarUrl={null} size={36} plain />
          </button>
          {open && (
            <div id="vx-topnav-menu" className="vx-topnav-menu" role="menu">
              <b>{name || roleLabel}</b>
              <span>
                {roleLabel}
                {groupName ? `, ${groupName}` : ""}
              </span>
              {canEditProfile && (
                <button type="button" role="menuitem" className="vx-topnav-menu-edit" onClick={editProfile}>
                  <Pencil size={15} aria-hidden /> Edit Profile
                </button>
              )}
              <button type="button" role="menuitem" onClick={onSignOut}>
                Log Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
