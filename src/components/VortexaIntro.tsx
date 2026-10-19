"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import "./vortexa-intro.css";

const INTRO_SEEN_KEY = "vortexa_logo_intro_seen";
let seenInPage = false;

/**
 * Show the logo once per tab session, including across refreshes and login.
 * Wait for the client storage check so returning visits never flash a cover.
 */
export function VortexaIntro() {
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const pathname = usePathname();
  const excluded = pathname === "/activate" || pathname === "/activate/preview";

  useEffect(() => {
    if (excluded) return;

    let seen = seenInPage;
    try {
      seen ||= window.sessionStorage.getItem(INTRO_SEEN_KEY) === "1";
      window.sessionStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      // Keep in-page navigation quiet even when browser storage is disabled.
    }
    seenInPage = true;
    if (!seen) setShow(true);
  }, [excluded]);

  // Let the activation sequence show its own entrance without a logo cover.
  if (excluded || !show) return null;

  return (
    <div className={`vx-intro${done ? " vx-intro-done" : ""}`} onClick={() => setDone(true)} aria-hidden="true">
      <div className="vx-intro-mark">
        <Image
          src="/vortexa-logo.webp"
          alt=""
          width={1600}
          height={918}
          priority
          sizes="(max-width: 460px) 52vw, 240px"
        />
      </div>
    </div>
  );
}
