"use client";

import { Coins, Gamepad2, ImageIcon, MapPin, Nfc, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { BlindBoxCard } from "@/components/BlindBoxCard";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { cn } from "@/lib/utils";

import "./game-control.css";
import { GameSection } from "./GameSection";
import { NfcSection } from "./NfcSection";
import { PuzzlesSection } from "./PuzzlesSection";
import { StationsSection } from "./StationsSection";
import { TokensSection } from "./TokensSection";

// HOGM's Ops page (/committee): Admin's game console in the Welcome page
// style. Game (start / end each day, own blind-box QR), Stations, Tokens
// (rules, reset), Puzzles, NFC. Each group's tokens and puzzles are on the
// Scores tab (GroupScores).
// Phones and portrait tablets switch sections with a chip row; landscape
// tablets and desktops get a side rail. Server permissions: migration 0071.

type SectionKey = "game" | "stations" | "tokens" | "puzzles" | "nfc";

const SECTIONS: { key: SectionKey; label: string; Icon: LucideIcon }[] = [
  { key: "game", label: "Game", Icon: Gamepad2 },
  { key: "stations", label: "Stations", Icon: MapPin },
  { key: "tokens", label: "Tokens", Icon: Coins },
  { key: "puzzles", label: "Puzzles", Icon: ImageIcon },
  { key: "nfc", label: "NFC", Icon: Nfc },
];

/** Section from the link: #stations; #blindbox is on Game. */
function sectionFromUrl(): SectionKey | null {
  const hash = window.location.hash.slice(1);
  if (SECTIONS.some((s) => s.key === hash)) return hash as SectionKey;
  return hash === "blindbox" ? "game" : null;
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
          {section === "game" && (
            <>
              <GameSection />
              <div id="blindbox" className="gc-bb">
                <BlindBoxCard showEmpty />
              </div>
            </>
          )}
          {section === "stations" && <StationsSection />}
          {section === "tokens" && <TokensSection />}
          {section === "puzzles" && <PuzzlesSection />}
          {section === "nfc" && <NfcSection />}
        </section>
      </div>
    </div>
  );
}
