"use client";

import { Coins } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { themeFromColor } from "@/components/freshie/groupTheme";
import { RewardArt } from "@/components/freshie/items/BlindBox";
import { nexusBody, vxDisplay, vxSlab } from "@/components/home/fonts";
import "@/components/freshie/freshie.css";

// The opening clip (public/blind-box-fast.mp4: the original blind-box.mp4 at
// 2.5x, about 4 seconds) and the frame shown while it loads.
export const BOX_REVEAL_VIDEO = "/blind-box-fast.mp4";
const POSTER = "/blind-box-poster.webp";

// If the clip neither ends nor errors (stalled network), show the result
// anyway: a Freshie has already paid, so the prize must never be stuck behind
// a video.
const GIVE_UP_MS = 8000;

// Blind box opening — hero moment. The clip plays full screen and ends on a
// star burst; then the prize is shown, in the Items page's reveal look (rays,
// coin, sparks) and the group's colour. Tap to skip at any time.
// Rendered in a portal outside the themed page, so it sets the --fh-* colours
// itself from `color`.
export function BoxReveal({
  tokens,
  special,
  memberName,
  balance,
  color,
  onContinue,
}: {
  tokens: number;
  special: boolean;
  memberName: string | null;
  balance: number | null;
  /** The group's colour (groups.color). */
  color: string | null | undefined;
  /** Called by the Continue button. Without it, Continue goes to the dashboard. */
  onContinue?: () => void;
}) {
  const [stage, setStage] = useState<"playing" | "revealed">("playing");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Respect "reduce motion": go straight to the prize.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setStage("revealed");
      return;
    }
    const giveUp = setTimeout(() => setStage("revealed"), GIVE_UP_MS);
    const video = videoRef.current;
    if (video) {
      // Try with sound first. Some browsers (notably iOS Safari) refuse sound
      // here; then play it silently instead.
      video.play().catch(() => {
        video.muted = true;
        video.play().catch(() => setStage("revealed"));
      });
    }
    return () => clearTimeout(giveUp);
  }, []);

  // Skipping (or finishing) must silence the clip even though it is hidden.
  useEffect(() => {
    if (stage === "revealed") videoRef.current?.pause();
  }, [stage]);

  const playing = stage === "playing";
  const theme = themeFromColor(color);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden px-4"
      style={{
        background: `radial-gradient(70% 50% at 50% 38%, color-mix(in srgb, ${theme.glow} 26%, transparent), transparent 72%), #030b1c`,
      }}
      onClick={() => playing && setStage("revealed")}
    >
      {/* Kept mounted (hidden once revealed) so the clip is never re-created. */}
      <video
        ref={videoRef}
        src={BOX_REVEAL_VIDEO}
        poster={POSTER}
        preload="auto"
        playsInline
        onEnded={() => setStage("revealed")}
        onError={() => setStage("revealed")}
        aria-hidden="true"
        className={
          playing
            ? "absolute inset-x-0 top-1/2 h-[48dvh] w-full -translate-y-1/2 object-cover landscape:h-auto landscape:max-h-full landscape:object-contain"
            : "hidden"
        }
        // The clip is 16:9. On a portrait phone it fills the width at about half
        // the screen height (object-cover trims the sides; the box sits in the
        // middle and stays in view) instead of shrinking to a thin strip. On a
        // landscape screen the whole clip shows. The top and bottom edges fade
        // into the page background.
        style={{
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent, black 14%, black 86%, transparent)",
          maskImage:
            "linear-gradient(to bottom, transparent, black 14%, black 86%, transparent)",
        }}
      />

      {playing ? (
        <p className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] text-sm text-white/60">
          Tap to skip
        </p>
      ) : (
        <div
          className={`fh bb-flow ${vxDisplay.variable} ${vxSlab.variable} ${nexusBody.variable}`}
          data-kind={special ? "gold" : "standard"}
          style={
            {
              "--fh-accent": theme.accent,
              "--fh-glow": theme.glow,
              "--fh-blue": theme.accent,
              "--fh-blue-light": theme.accentLight,
              "--fh-on-blue": theme.onAccent,
              // A normal box glows in the group's colour; a special one stays gold.
              ...(special ? {} : { "--bb-a": theme.accentLight, "--bb-q": theme.accent }),
            } as React.CSSProperties
          }
          role="status"
        >
          <div className="bb-reveal">
            <span className="bb-rays" aria-hidden />
            <RewardArt type="tokens">
              <span className="bb-coin" aria-hidden>
                <Coins size={56} strokeWidth={2} />
              </span>
            </RewardArt>
            <span className="bb-rtag fh-mono">{special ? "Special Box" : "Tokens"}</span>
            {memberName && <span className="bb-no fh-mono">From {memberName}</span>}
            <h2 className="bb-rtitle fh-slab">
              +{tokens} Token{tokens !== 1 ? "s" : ""}
            </h2>
            <p className="bb-rdetail">
              Added to your group&apos;s tokens.
              {balance !== null && (
                <>
                  <br />
                  You now have <b>{balance} tokens</b>.
                </>
              )}
            </p>
            <div className="bb-ractions">
              {onContinue ? (
                <button type="button" onClick={onContinue} className="fh-btn fh-btn-primary">
                  Back to Items
                </button>
              ) : (
                <a href="/dashboard" className="fh-btn fh-btn-primary">
                  Continue
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
