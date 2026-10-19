"use client";
import { useEffect, useState, type CSSProperties } from "react";
import Image from "next/image";
import { PROJECTOR_LABELS, type ProjectorLocation } from "@/lib/types";
import "./victory-takeover.css";

const colors = ["#0dfcfd", "#fe06ab", "#e0b4fc", "#fc9e3d", "#f2ff0b"];
export function VictoryTakeover({location, groupName}: {location: ProjectorLocation; groupName: string | null}) {
  const [lit, setLit] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setLit(true);
  }, []);
  return <main className={"vt-scene " + (ready ? "vt-ready " : "") + (lit ? "vt-lit" : "")}>
    <div className="vt-sky" aria-hidden="true">{Array.from({length:28},(_,i)=><i key={i} style={{left:(i*37+7)%100+"%",top:(i*23+3)%90+"%", "--color":colors[i%5],"--delay":i%5*-.6+"s"} as CSSProperties}/>)}</div>
    <div className="vt-wash" aria-hidden="true"/>
    <div className="vt-logo"><Image src="/vortexa-logo-sm.webp" width={320} height={184} alt="Vortexa" priority/></div>
    <div className="vt-magic" aria-hidden="true">
      <div className="vt-wave"/>
      {colors.map((color,i)=><div className="vt-trail" key={color} style={{"--color":color,"--turn":i*72+"deg","--delay":i*.06+"s"} as CSSProperties}><i/></div>)}
      <div className="vt-core" onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.animationName === "vt-core-charge") setLit(true);
      }}><svg viewBox="0 0 80 80"><path d="M40 4Q44 34 76 40Q44 44 40 76Q36 44 4 40Q36 36 40 4Z"/></svg></div>
      {Array.from({length:45},(_,i)=>{const angle=i*137.508*Math.PI/180;const distance=110+i%7*32;return <i className="vt-spark" key={i} style={{"--x":(Math.cos(angle)*distance).toFixed(3)+"px","--y":(Math.sin(angle)*distance).toFixed(3)+"px","--color":colors[i%5],"--delay":i%5*.055+"s","--spin":i*43+"deg"} as CSSProperties}/>;})}
    </div>
    <div className="vt-charging" aria-hidden={lit}>Gathering the magic<span/></div>
    <section className="vt-result" aria-live="polite" aria-atomic="true">{lit&&<><h1>PROJECTOR<span>REVIVED!</span></h1><p className="vt-location">{PROJECTOR_LABELS[location]}</p>{groupName&&<p className="vt-group">Brought back by <strong>{groupName}</strong></p>}<p className="vt-note">The magic is back.</p></>}</section>
    <svg className="vt-park" viewBox="0 0 600 230" fill="none" aria-hidden="true">
      <defs><linearGradient id="vt-park-color"><stop stopColor="#0dfcfd"/><stop offset=".5" stopColor="#e0b4fc"/><stop offset="1" stopColor="#fe06ab"/></linearGradient></defs>
      <g stroke="url(#vt-park-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path pathLength="1" className="vt-outline" d="M0 213Q65 210 105 150T200 153T290 180T375 140T480 172T600 160M0 225Q80 218 117 161T195 166T295 192T380 153T480 184T600 173"/>
        <g className="vt-wheel"><circle cx="110" cy="94" r="66"/><circle cx="110" cy="94" r="57"/>{Array.from({length:12},(_,i)=><g key={i} transform={"rotate("+i*30+" 110 94)"}><path d="M110 94V28"/><rect x="105" y="22" width="10" height="12" rx="3" fill="#080c20"/></g>)}<circle cx="110" cy="94" r="8" fill="#e0b4fc"/></g>
        <path className="vt-outline" pathLength="1" d="M80 220L110 94L140 220M366 219V125H383V94L400 69L417 94V125H435V73L452 40L469 73V125H487V96L504 71L521 96V219M383 125V219M435 125V219M469 125V219M400 69V45L418 51L400 57M452 40V13L473 20L452 27M504 71V47L520 53L504 59M432 219V188Q451 163 470 188V219M392 149H402V162H392ZM494 149H504V162H494Z"/>
        <path className="vt-outline" pathLength="1" d="M205 220V165L243 120L281 165V220M198 165H288M213 166V217M234 166V217M256 166V217M277 166V217M243 120V102L263 108L243 115"/>
      </g>
    </svg>
  </main>;
}
