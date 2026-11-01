"use client";

import { ArrowRight, Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import { Countdown, PhaseCard } from "@/components/freshie/FreshieHome";
import { themeFromColor } from "@/components/freshie/groupTheme";
import { nexusBody, vxDisplay, vxSlab } from "@/components/home/fonts";
import { NavIcon } from "@/components/NavIcon";
import { usePhases } from "@/components/PhaseTimerProvider";
import { useProfile } from "@/components/ProfileProvider";
import { useOpenShellMenu } from "@/components/ShellMenu";
import { useGroup } from "@/components/useGroup";
import { ROLE_LABELS, type UserRole } from "@/lib/types";

import "./staff-dashboard.css";

type Tool = { href: string; code: string; title: string; description: string };
type Workspace = { title: string; description: string; primary: Tool; tools: Tool[] };
const map: Tool = { href: "/map", code: "MP", title: "Campus Map", description: "Find stations and group locations" };
const schedule: Tool = { href: "/schedule", code: "PL", title: "Schedule", description: "See the two-day programme" };
const tokens: Tool = { href: "/token", code: "TK", title: "Scoreboard", description: "Live group tokens and puzzle pieces" };
const operations: Tool = { href: "/committee", code: "OP", title: "Open Operations", description: "View the live map, headcount and balances" };
const station: Tool = { href: "/gm", code: "GM", title: "Open Station Panel", description: "Manage results, rewards and station status" };
const committee: Workspace = { title: "Event Operations", description: "Keep the event moving. Your crew tools are here.", primary: operations, tools: [map, tokens, schedule] };
const workspaces: Partial<Record<UserRole, Workspace>> = {
  faci: { title: "Your Group", description: "Bring your team together, check attendance and head out.", primary: { href: "/checklist", code: "AT", title: "Checklist", description: "Name, attendance and location for your group" }, tools: [map, { href: "/inventory", code: "IT", title: "Group Items", description: "View puzzle pieces and collected items" }, schedule] },
  guardian_gm: { title: "Guardian Station", description: "Check completed puzzles and light projectors.", primary: { href: "/guardian", code: "VG", title: "Guardian Verification", description: "Verify puzzle sets and light projectors" }, tools: [station, tokens, map, schedule] },
  // HOF, HOGM, Committee and GM use StaffHome; `committee` stays as the fallback.
  admin: { title: "Control Room", description: "Manage the event, people and game settings.", primary: { href: "/admin", code: "AD", title: "Open Admin Console", description: "Access live controls and event settings" }, tools: [{ href: "/admin/freshies", code: "RC", title: "Freshie Control", description: "Manage groups and registration" }, map, schedule] },
};

export function StaffDashboard() {
  const profile = useProfile();
  const { group, loading } = useGroup();
  const openMenu = useOpenShellMenu();
  const workspace = workspaces[profile.role] ?? committee;
  const isFaci = profile.role === "faci";
  const { phases } = usePhases();
  const live = phases.some((p) => p.state === "active" || p.state === "paused");
  const theme = themeFromColor(isFaci ? group?.color : "#0DFCFD");
  const vars = {
    "--fh-accent": theme.accent, "--fh-glow": theme.glow,
    "--fh-blue": theme.accent, "--fh-blue-light": theme.accentLight,
    "--fh-on-blue": theme.onAccent,
  } as CSSProperties;

  return (
    <div className={`fh sd ${nexusBody.variable} ${vxDisplay.variable} ${vxSlab.variable}`} style={vars}>
      <header className="sd-header">
        <Image src="/vortexa-logo-sm.webp" alt="Vortexa" width={320} height={184} priority />
        <div><span>{ROLE_LABELS[profile.role]}</span><button type="button" aria-label="Open menu" onClick={() => openMenu?.()}><Menu size={22} aria-hidden /></button></div>
      </header>
      <section className="sd-intro" aria-labelledby="sd-title">
        <p className="sd-greeting">Hi, {profile.full_name || "there"}</p>
        <h1 id="sd-title">{workspace.title}</h1>
        <p>{workspace.description}</p>
        {isFaci && <p className="sd-group">{loading ? "Loading your group…" : group ? `${group.name}${group.display_name ? `: ${group.display_name}` : ""}` : "No group assigned yet"}</p>}
      </section>
      {/* Same rule as Freshie Home: the running game, else the event countdown. */}
      {live ? <PhaseCard /> : <Countdown />}
      <Link className="sd-primary" href={workspace.primary.href}>
        <NavIcon code={workspace.primary.code} size={25} aria-hidden />
        <span><strong>{workspace.primary.title}</strong><small>{workspace.primary.description}</small></span>
        <ArrowRight size={23} aria-hidden />
      </Link>
      <section className="sd-tools" aria-labelledby="sd-tools-title">
        <h2 id="sd-tools-title">{isFaci ? "Around the Event" : "Event Tools"}</h2>
        <div>{workspace.tools.map(tool => <Link key={tool.href} href={tool.href}>
          <NavIcon code={tool.code} size={23} aria-hidden />
          <span><strong>{tool.title}</strong><small>{tool.description}</small></span>
          <ArrowRight size={18} aria-hidden />
        </Link>)}</div>
      </section>
      <p className="sd-footer">XMUM 26/12 Orientation</p>
    </div>
  );
}
