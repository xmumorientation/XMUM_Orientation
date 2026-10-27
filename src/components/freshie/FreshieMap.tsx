"use client";

import { PersistentCampusMap } from "@/components/campus-map/PersistentCampusMap";
import { FaciTrackingPanel } from "@/components/FaciTrackingPanel";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { useGroup } from "@/components/useGroup";

import "./freshie.css";
import { themeFromColor } from "./groupTheme";

// Freshie and Faci /map: the same night and group colour as Freshie Home and
// Schedule. CampusMap keeps its own markup; .fh-map in freshie.css recolours
// its cards. The full-screen map is a portal outside .fh-map and keeps its own look.
export function FreshieMap({ showGroupPins }: { showGroupPins: boolean }) {
  const { group } = useGroup();
  const theme = themeFromColor(group?.color);

  return (
    <div
      className={`fh fh-map ${vxSlab.variable} ${vxDisplay.variable}`}
      style={
        {
          "--fh-accent": theme.accent,
          "--fh-glow": theme.glow,
          "--fh-blue": theme.accent,
          "--fh-blue-light": theme.accentLight,
          "--fh-on-blue": theme.onAccent,
        } as React.CSSProperties
      }
    >
      <div className="fh-bg" aria-hidden>
        <div className="fh-glow" style={{ width: 380, height: 380, background: "var(--fh-glow)", left: -150, top: 40, opacity: 0.35 }} />
        <div className="fh-glow" style={{ width: 280, height: 280, background: "#FE06AB", right: -140, bottom: 40, opacity: 0.16 }} />
      </div>

      <header className="fh-map-top">
        <p className="fh-eyebrow fh-mono">Campus</p>
        <h1 className="fh-h2">Map</h1>
        <p className="fh-map-sub">Live game stations. Tap the map for a full-screen view. Tap a station or a building&apos;s badge for details.</p>
      </header>

      <FaciTrackingPanel />
      <PersistentCampusMap showGroupPins={showGroupPins} />
    </div>
  );
}
