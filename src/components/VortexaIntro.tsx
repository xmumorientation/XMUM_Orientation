"use client";

import Image from "next/image";
import { useState } from "react";

import "./vortexa-intro.css";

/**
 * Vortexa logo reveal when the site is first opened or right after login, on
 * any page. Mounted once in the root layout, so it plays on a full page load
 * only (opening the site, a refresh, and every login flow, which all end in a
 * full load) and not on in-app navigation. Same idea as the interview site's
 * HomeIntro. The whole animation, including the fade-out, runs in CSS, so it
 * shows straight from the server HTML and still clears if scripts are slow.
 * A tap ends it early; there is no visible "skip" hint.
 */
export function VortexaIntro() {
  const [done, setDone] = useState(false);

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
