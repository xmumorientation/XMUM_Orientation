"use client";

import { Coins, FerrisWheel, ImageIcon, MapPin, ScrollText } from "lucide-react";
import { useEffect, useState } from "react";

import { FunfairSection } from "./FunfairSection";
import { LogSection } from "./LogSection";
import { OpsShell, type OpsSection } from "./OpsShell";
import { PuzzlesSection } from "./PuzzlesSection";
import { StationsSection } from "./StationsSection";
import { TokensSection } from "./TokensSection";

// HOGM's Ops page (/committee): part of Admin's game console in the Welcome
// page style (OpsShell). Stations, Tokens (rules, reset), Puzzles, Funfair
// (which keys power each zone of the 3D map's funfair) and Log (the game's
// audit log, read only). Starting and ending the games and NFC are Admin's
// (Live control, Admin → NFC). Each group's tokens and puzzles are on the
// Scores tab (GroupScores); the HOGM's own blind-box QR is on Home
// (StaffHome). Server permissions: migration 0071.

type SectionKey = "stations" | "tokens" | "puzzles" | "funfair" | "log";

const SECTIONS: OpsSection<SectionKey>[] = [
  { key: "stations", label: "Stations", Icon: MapPin },
  { key: "tokens", label: "Tokens", Icon: Coins },
  { key: "puzzles", label: "Puzzles", Icon: ImageIcon },
  { key: "funfair", label: "Funfair", Icon: FerrisWheel },
  { key: "log", label: "Log", Icon: ScrollText },
];

/** Section from the link: #stations. */
function sectionFromUrl(): SectionKey | null {
  const hash = window.location.hash.slice(1);
  return SECTIONS.some((s) => s.key === hash) ? (hash as SectionKey) : null;
}

export function GameControl() {
  const [section, setSection] = useState<SectionKey>("stations");

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

  return (
    <OpsShell name="Game Control" sections={SECTIONS} current={section} onPick={pick}>
      {section === "stations" && <StationsSection />}
      {section === "tokens" && <TokensSection />}
      {section === "puzzles" && <PuzzlesSection />}
      {section === "funfair" && <FunfairSection />}
      {section === "log" && <LogSection />}
    </OpsShell>
  );
}
