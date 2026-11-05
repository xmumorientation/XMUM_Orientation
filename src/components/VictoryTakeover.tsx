"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ACTIVATION_JOURNEY_KEY } from "@/lib/activation-journey";
import { prefetchCampusMap } from "@/components/campus-map/preload";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import type { FunfairZone } from "@/lib/funfair";
import "./victory-takeover.css";

const colors = ["#0dfcfd", "#fe06ab", "#e0b4fc", "#fc9e3d", "#f2ff0b"];
export function VictoryTakeover({place, groupName, replayZones = [], mapHref = "/map"}: {
  /** Where the projector stands (Admin → Puzzles, 0097). */
  place: string; groupName: string | null; replayZones?: FunfairZone[]; mapHref?: string;
}) {
  const router = useRouter();
  const navigating = useRef(false);
  const [celebrated, setCelebrated] = useState(false);
  const [opening, setOpening] = useState(false);
  function openMap() {
    if (navigating.current) return;
    navigating.current = true;
    setOpening(true);
    try { sessionStorage.setItem(ACTIVATION_JOURNEY_KEY, JSON.stringify({at:Date.now(), zones:replayZones})); } catch { /* Storage is optional; the real map still opens. */ }
    router.replace(`${mapHref}?arrival=activation`);
  }
  useEffect(() => { router.prefetch(mapHref); prefetchCampusMap(mapHref); }, [router, mapHref]);
  const [lit, setLit] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
    const fallback = window.setTimeout(() => setLit(true), 3000);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setLit(true);
    return () => window.clearTimeout(fallback);
  }, []);
  useEffect(() => {
    if (!lit) return;
    // animationend normally advances the sequence. The bound also covers
    // reduced motion and browsers that suppress CSS animation events.
    const delay = celebrated ? 1200 : 3500;
    const timer = window.setTimeout(openMap, delay);
    return () => window.clearTimeout(timer);
    // openMap reads the current success props; they do not change during a takeover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lit, celebrated]);
  return <main className={`${vxDisplay.variable} ${vxSlab.variable} vt-scene ${ready ? "vt-ready " : ""}${lit ? "vt-lit" : ""}`}>
    <div className="vt-sky" aria-hidden="true">{Array.from({length:28},(_,i)=><i key={i} style={{left:(i*37+7)%100+"%",top:(i*23+3)%90+"%", "--color":colors[i%5],"--delay":i%5*-.6+"s"} as CSSProperties}/>)}</div>
    <div className="vt-wash" aria-hidden="true"/>
    <div className="vt-logo"><Image src="/vortexa-logo-sm.webp" width={320} height={184} alt="Vortexa" priority/></div>
    <div className="vt-magic" aria-hidden="true">
      <div className="vt-wave"/>
      {colors.map((color,i)=><div className="vt-trail" key={color} style={{"--color":color,"--turn":i*72+"deg","--delay":i*.06+"s"} as CSSProperties}><i/></div>)}
      <div className="vt-core" onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.animationName === "vt-core-charge") setLit(true);
      }}><svg viewBox="0 0 80 80"><path d="M40 4Q44 34 76 40Q44 44 40 76Q36 44 4 40Q36 36 40 4Z"/></svg></div>
      {Array.from({length:16},(_,i)=>{const angle=i*137.508*Math.PI/180;const distance=95+i%5*24;return <i className="vt-spark" key={i} style={{"--x":(Math.cos(angle)*distance).toFixed(3)+"px","--y":(Math.sin(angle)*distance).toFixed(3)+"px","--color":colors[i%5],"--delay":i%5*.055+"s","--spin":i*43+"deg"} as CSSProperties}/>;})}
    </div>
    <div className="vt-charging" aria-hidden={lit}>Gathering the magic<span/></div>
    <section className="vt-result" aria-live="polite" aria-atomic="true">{lit&&<><h1>PROJECTOR<span>LIT!</span></h1><p className="vt-location">{place}</p>{groupName&&<p className="vt-group">Lit by <strong>{groupName}</strong></p>}<p className="vt-note" onAnimationEnd={() => setCelebrated(true)}>The magic is back.</p><button type="button" className="vt-map-button" onClick={openMap} disabled={opening}>{opening ? "Opening the 3D Map…" : "See the Funfair Light Up →"}</button><p className="vt-next" role="status">Taking you to the funfair…</p></>}</section>
    <div className="vt-stage" aria-hidden="true"><div className="vt-stage-line" /><div className="vt-stage-lights">{Array.from({length:13},(_,i)=><i key={i} style={{"--delay":`${i * 0.045}s`} as CSSProperties}/>)}</div></div>
  </main>;
}
