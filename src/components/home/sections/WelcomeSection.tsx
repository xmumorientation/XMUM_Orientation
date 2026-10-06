"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { SPONSORS, SPONSORS_ARE_EXAMPLES, scrollToSection } from "../data";
import { Glow, Spark } from "../decor";

export function WelcomeSection({ onJoin }: { onJoin?: () => void }) {
  const sectionRef = useRef<HTMLElement>(null);
  const creditsRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLButtonElement>(null);
  const [hintFits, setHintFits] = useState(true);

  // The logo row comes first: hide the Scroll hint on any screen where the
  // two would touch. It depends on width and height, so it is measured.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const check = () => {
      const credits = creditsRef.current?.getBoundingClientRect();
      const hint = hintRef.current?.getBoundingClientRect();
      if (credits && hint) setHintFits(credits.bottom + 12 <= hint.top);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} id="welcome" className="vx-sec vx-welcome" aria-labelledby="welcome-title">
      <div className="vx-dots" />
      <Glow size="min(520px, 90vw)" color="var(--vx-navy)" style={{ left: "-8%", top: "12%", opacity: 0.45 }} />
      <Glow size="min(380px, 70vw)" color="var(--vx-pink)" style={{ right: "-4%", bottom: "-6%", opacity: 0.28 }} />
      <Spark size={18} color="var(--vx-yellow)" style={{ left: "16%", top: "24%", opacity: 0.55 }} />
      <Spark size={14} color="var(--vx-cyan)" style={{ right: "18%", top: "22%", opacity: 0.45 }} />

      <div className="vx-inner">
        <div className="vx-eyebrow vx-rise">XMUM 26/12 Orientation</div>

        <h1 id="welcome-title" className="vx-rise" style={{ margin: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <span className="vx-welcome-pre">WELCOME TO</span>
          <span className="vx-welcome-mark vx-holo">Vortexa</span>
        </h1>

        <p className="vx-welcome-slogan vx-rise-2">One Ticket, One Ride. Discover the Adventure Inside.</p>

        <p className="vx-lead vx-rise-2">Vortexa is the official theme of XMUM Orientation 2026</p>

        <div className="vx-welcome-actions vx-rise-3">
          <button type="button" className="vx-btn vx-btn-primary" onClick={() => onJoin?.()}>
            Join the Game ★
          </button>
          <button type="button" className="vx-btn vx-btn-ghost" onClick={() => scrollToSection("check-in")}>
            How to check in
          </button>
        </div>

        <div className="vx-welcome-strip vx-mono vx-rise-3">
          <span><b>28–29 NOV</b>2026</span>
          <span><b>2 DAYS</b>on campus</span>
          <span><b>XMUM</b>Sepang, Selangor</span>
        </div>

        {/* Organiser on the left, sponsors on the right. */}
        <div ref={creditsRef} className="vx-credits vx-rise-3">
          <div className="vx-credits-col">
            <span className="vx-credits-label vx-mono">Organised by</span>
            <Image
              src="/xmum-logo-horizontal-white.png"
              alt="Xiamen University Malaysia"
              width={1024}
              height={211}
              className="vx-credits-xmum"
            />
          </div>
          <span className="vx-credits-sep" aria-hidden />
          <div className="vx-credits-col vx-credits-sponsors">
            <span className="vx-credits-label vx-mono">
              Supported by{SPONSORS_ARE_EXAMPLES && <span className="vx-credits-example"> (Example)</span>}
            </span>
            <ul>
              {SPONSORS.map((s, i) => {
                const body = s.logo ? (
                  <Image src={s.logo} alt={s.name} width={240} height={102} className="vx-sponsor-logo" />
                ) : (
                  <span className="vx-sponsor-ph">
                    <i aria-hidden />
                    {s.name}
                  </span>
                );
                return (
                  <li key={i}>
                    {s.href ? (
                      <a href={s.href} target="_blank" rel="noopener noreferrer">
                        {body}
                      </a>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      <button
        ref={hintRef}
        type="button"
        className="vx-scrollhint"
        data-fits={hintFits}
        aria-hidden={!hintFits}
        tabIndex={hintFits ? undefined : -1}
        onClick={() => scrollToSection("overview")}
      >
        <span className="vx-scrollhint-line" aria-hidden="true" />
        <span>Scroll</span>
      </button>
    </section>
  );
}
