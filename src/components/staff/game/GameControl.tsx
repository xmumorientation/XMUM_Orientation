"use client";

import { FerrisWheel, ImageIcon, MapPin, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { cn } from "@/lib/utils";

import { FunfairSection } from "./FunfairSection";
import "./game-control.css";
import { PuzzlesSection } from "./PuzzlesSection";
import { StationsSection } from "./StationsSection";

// HOGM's Ops page (/committee): part of Admin's game console in the Welcome
// page style. Stations, Puzzles, Funfair (which keys power each zone of the 3D
// map's funfair). Starting and ending the games, token rules and the reset,
// and NFC are Admin's (Live control, Admin → Token, Admin → NFC). Each group's
// tokens and puzzles are on the Scores tab (GroupScores); the HOGM's own
// blind-box QR is on Home (StaffHome). Phones and portrait tablets switch
// sections with three equal icon tabs; landscape tablets and desktops get a
// side rail. Server permissions: migration 0071.

type SectionKey = "stations" | "puzzles" | "funfair";

const SECTIONS: { key: SectionKey; label: string; Icon: LucideIcon }[] = [
  { key: "stations", label: "Stations", Icon: MapPin },
  { key: "puzzles", label: "Puzzles", Icon: ImageIcon },
  { key: "funfair", label: "Funfair", Icon: FerrisWheel },
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

  const current = SECTIONS.find((s) => s.key === section)!;

  return (
    <div className={cn("gc", vxDisplay.variable, vxSlab.variable)}>
      <div className="gc-bg" aria-hidden>
        <i className="gc-orb gc-orb-navy" />
        <i className="gc-orb gc-orb-pink" />
      </div>

      <header className="gc-top">
        <h1 className="gc-title gc-title-holo">OPS</h1>
        <p className="gc-sub">
          <i aria-hidden />
          Game control · <b>{current.label}</b>
        </p>
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
          {section === "stations" && <StationsSection />}
          {section === "puzzles" && <PuzzlesSection />}
          {section === "funfair" && <FunfairSection />}
        </section>
      </div>
    </div>
  );
}
