"use client";

import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { cn } from "@/lib/utils";

import "./game-control.css";

// The Ops page's frame in the Welcome page style, shared by HOGM's Game
// control and the HOF / Committee / Admin overview: the night background, the
// OPS title (plain white, like the other subpages' titles; the holo mark stays
// on the Welcome page), a mono line saying where you are, and the section switcher
// (equal icon tabs on phones and portrait tablets, a side rail from 1024px).
// The page keeps which section is open and passes it in.

export type OpsSection<K extends string> = { key: K; label: string; Icon: LucideIcon };

export function OpsShell<K extends string>({
  name,
  sections,
  current,
  onPick,
  children,
}: {
  /** The page's name in the mono line: "Game control", "Overview". */
  name: string;
  sections: OpsSection<K>[];
  current: K;
  onPick: (key: K) => void;
  children: React.ReactNode;
}) {
  const now = sections.find((s) => s.key === current) ?? sections[0];

  return (
    <div className={cn("gc", vxDisplay.variable, vxSlab.variable)}>
      <div className="gc-bg" aria-hidden>
        <i className="gc-orb gc-orb-navy" />
        <i className="gc-orb gc-orb-pink" />
      </div>

      <header className="gc-top">
        <h1 className="gc-title">OPS</h1>
        <p className="gc-sub">
          <i aria-hidden />
          {name} / <b>{now.label}</b>
        </p>
      </header>

      <div className="gc-layout">
        <nav className="gc-nav" aria-label={`${name} sections`} style={{ "--gc-tabs": sections.length } as CSSProperties}>
          {sections.map(({ key, label, Icon }) => (
            <button key={key} type="button" aria-current={key === now.key ? "page" : undefined} onClick={() => onPick(key)}>
              <Icon size={17} aria-hidden />
              {label}
            </button>
          ))}
        </nav>

        <section className="gc-main" aria-label={now.label}>
          {children}
        </section>
      </div>
    </div>
  );
}
