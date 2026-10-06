"use client";

import Image from "next/image";

import { SPONSORS, SPONSORS_ARE_EXAMPLES, scrollToSection } from "../data";

export function WelcomeSection({ onJoin }: { onJoin?: () => void }) {
  return (
    <section id="welcome" className="vx-sec vx-welcome" aria-labelledby="welcome-title">

      <div className="vx-inner">
        <div className="vx-eyebrow vx-rise">XMUM 26/12 Orientation</div>

        <h1 id="welcome-title" className="vx-rise" style={{ margin: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <span className="vx-welcome-pre">WELCOME TO</span>
          <span className="vx-welcome-mark vx-holo">Vortexa</span>
        </h1>

        <p className="vx-welcome-slogan vx-rise-2">One Ticket, One Ride.<br />Discover the Adventure Inside.</p>


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
        <div className="vx-credits vx-rise-3">
          <div className="vx-credits-col">
            <span className="vx-credits-label vx-mono">Organised by</span>
            <Image
              src="/xmum-logo-horizontal-white.png"
              alt="Xiamen University Malaysia"
              width={1024}
              height={211}
              sizes="(max-width: 640px) 160px, 210px"
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

    </section>
  );
}
