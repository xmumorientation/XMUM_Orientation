"use client";

import { Coins, Gamepad2, ImageIcon, MapPin, Nfc, Users, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { BlindBoxCard } from "@/components/BlindBoxCard";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import "./game-control.css";
import { GameSection } from "./GameSection";
import { NfcSection } from "./NfcSection";
import { PuzzlesSection } from "./PuzzlesSection";
import { StationsSection } from "./StationsSection";
import { TokensSection } from "./TokensSection";

// HOGM's Ops page (/committee): Admin's game console in the Welcome page
// style. Game (start / end each day), Stations, Tokens (rules, reset),
// Puzzles, NFC, and Floor (headcount, balances, own blind-box QR).
// Phones and portrait tablets switch sections with a chip row; landscape
// tablets and desktops get a side rail. Server permissions: migration 0071.

type SectionKey = "game" | "stations" | "tokens" | "puzzles" | "nfc" | "floor";

const SECTIONS: { key: SectionKey; label: string; Icon: LucideIcon }[] = [
  { key: "game", label: "Game", Icon: Gamepad2 },
  { key: "stations", label: "Stations", Icon: MapPin },
  { key: "tokens", label: "Tokens", Icon: Coins },
  { key: "puzzles", label: "Puzzles", Icon: ImageIcon },
  { key: "nfc", label: "NFC", Icon: Nfc },
  { key: "floor", label: "Floor", Icon: Users },
];

/** Section from the link: #stations, or Home's ?view=attendance and #blindbox (Floor). */
function sectionFromUrl(): SectionKey | null {
  const hash = window.location.hash.slice(1);
  if (SECTIONS.some((s) => s.key === hash)) return hash as SectionKey;
  const view = new URLSearchParams(window.location.search).get("view");
  if (hash === "blindbox" || view === "attendance" || view === "balances") return "floor";
  return null;
}

type FloorGroup = { id: number; name: string; token_balance: number };

function FloorSection() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [groups, setGroups] = useState<FloorGroup[]>([]);
  const [heads, setHeads] = useState<Record<number, number>>({});

  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: gs }, { data: hcs }] = await Promise.all([
        supabase.from("groups").select("id, name, token_balance").order("id"),
        supabase.from("group_headcounts").select("group_id, headcount"),
      ]);
      if (!active) return;
      setGroups((gs as FloorGroup[]) ?? []);
      setHeads(Object.fromEntries(((hcs as { group_id: number; headcount: number }[]) ?? []).map((r) => [r.group_id, r.headcount])));
    }
    load();
    const channel = supabase
      .channel(`gc-floor-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_headcounts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, load)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const total = Object.values(heads).reduce((a, b) => a + b, 0);
  return (
    <div className="gc-stack">
      <section className="gc-card" aria-labelledby="gc-floor-groups">
        <header className="gc-game-head gc-pad">
          <h3 id="gc-floor-groups" className="gc-eyebrow">Groups</h3>
          <span className="gc-muted">{total} checked in</span>
        </header>
        <ul className="gc-rows gc-floor">
          <li className="gc-rows-head" aria-hidden>
            <span>Group</span>
            <span>People</span>
            <span>Tokens</span>
          </li>
          {groups.map((g) => (
            <li key={g.id}>
              <span>{g.name}</span>
              <b>{heads[g.id] ?? "—"}</b>
              <b>{g.token_balance}</b>
            </li>
          ))}
        </ul>
      </section>
      <div id="blindbox" className="gc-bb">
        <BlindBoxCard />
      </div>
    </div>
  );
}

export function GameControl() {
  const [section, setSection] = useState<SectionKey>("game");

  useEffect(() => {
    const follow = () => {
      const s = sectionFromUrl();
      if (s) setSection(s);
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);

  function pick(key: SectionKey) {
    setSection(key);
    window.history.replaceState(null, "", `${window.location.pathname}#${key}`);
  }

  const current = SECTIONS.find((s) => s.key === section)!;

  return (
    <div className={cn("gc", vxDisplay.variable, vxSlab.variable)}>
      <div className="gc-bg" aria-hidden>
        <i className="gc-orb gc-orb-navy" />
        <i className="gc-orb gc-orb-pink" />
      </div>

      <header className="gc-top">
        <p className="gc-eyebrow">Ops</p>
        <h1 className="gc-title">Game Control</h1>
      </header>

      <div className="gc-layout">
        <nav className="gc-nav" aria-label="Game control sections">
          {SECTIONS.map(({ key, label, Icon }) => (
            <button key={key} type="button" aria-current={key === section ? "page" : undefined} onClick={() => pick(key)}>
              <Icon size={17} aria-hidden />
              {label}
            </button>
          ))}
        </nav>

        <section className="gc-main" aria-label={current.label}>
          {section === "game" && <GameSection />}
          {section === "stations" && <StationsSection />}
          {section === "tokens" && <TokensSection />}
          {section === "puzzles" && <PuzzlesSection />}
          {section === "nfc" && <NfcSection />}
          {section === "floor" && <FloorSection />}
        </section>
      </div>
    </div>
  );
}
