"use client";

import { Glow } from "../decor";

/**
 * Public Welcome check-in explainer.
 * Group is assigned at the registration counter (wristband ticket;
 * colour = group). Shared group QR on the band/ticket opens the group site.
 * Website /check-in/draw is backup only — not promoted here.
 */
export function CheckInSection() {
  return (
    <section id="check-in" className="vx-sec vx-join vx-checkin" aria-labelledby="check-in-title">
      <div className="vx-dots" />
      <Glow size="min(480px, 90vw)" color="var(--vx-navy)" style={{ left: "8%", top: "14%", opacity: 0.55 }} />
      <Glow size="min(320px, 70vw)" color="var(--vx-pink)" style={{ right: "10%", bottom: "6%", opacity: 0.28 }} />

      <div className="vx-inner">
        <div className="vx-ticket vx-pass vx-rise">
          <div className="vx-pass-main">
            <div className="vx-eyebrow">Freshie check-in</div>
            <h2 id="check-in-title" className="vx-pass-title vx-holo">How to check in</h2>
            <p>
              Your group is set at the counter. Scan the QR on your wristband ticket to open your group Homepage.
            </p>

            <ol className="vx-checkin-steps">
              <li>
                <span className="vx-checkin-step-no vx-mono" aria-hidden>
                  01
                </span>
                <div>
                  <b>Get your wristband ticket</b>
                  <p>
                    At the counter you receive a wristband ticket. Your group is already assigned, and the colour is your group.
                  </p>
                </div>
              </li>
              <li>
                <span className="vx-checkin-step-no vx-mono" aria-hidden>
                  02
                </span>
                <div>
                  <b>Scan the group QR</b>
                  <p>Scan the QR on your wristband ticket to open your group Homepage.</p>
                </div>
              </li>
              <li>
                <span className="vx-checkin-step-no vx-mono" aria-hidden>
                  03
                </span>
                <div>
                  <b>Using another device?</b>
                  <p>Scan the QR on your wristband ticket to open your group page on another device.</p>
                </div>
              </li>
            </ol>

          </div>
          <div className="vx-pass-stub vx-mono">
            <span>GATE OPENS</span>
            <b className="vx-num">28 NOV</b>
            <span className="vx-pass-year">2026, XMUM</span>
          </div>
        </div>
      </div>
    </section>
  );
}
