"use client";

import { Coins, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// The opening clip (public/blind-box-fast.mp4: the original blind-box.mp4 at
// 2.5x, about 4 seconds) and the frame shown while it loads.
export const BOX_REVEAL_VIDEO = "/blind-box-fast.mp4";
const POSTER = "/blind-box-poster.jpg";

// If the clip neither ends nor errors (stalled network), show the result
// anyway: a Freshie has already paid, so the prize must never be stuck behind
// a video.
const GIVE_UP_MS = 8000;

// Blind box opening — hero moment. The clip plays full screen and ends on a
// star burst; then the prize is shown. Tap to skip at any time.
export function BoxReveal({
  tokens,
  special,
  memberName,
  balance,
}: {
  tokens: number;
  special: boolean;
  memberName: string | null;
  balance: number | null;
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

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-night-900 px-6"
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
        <div className="animate-burst flex flex-col items-center text-center">
          {special ? (
            <Coins
              size={96}
              strokeWidth={1.25}
              className="text-amber-400 drop-shadow-[0_0_40px_rgba(251,191,36,0.9)]"
            />
          ) : (
            <Sparkles
              size={96}
              strokeWidth={1.25}
              className="text-brand-1 drop-shadow-[0_0_24px_rgb(var(--brand-1-rgb)/0.7)]"
            />
          )}
          <p className="mt-6 font-display text-3xl font-bold text-white">
            +{tokens} Token{tokens !== 1 ? "s" : ""}
          </p>
          {special && (
            <p className="mt-2 animate-pulseglow text-lg font-semibold text-amber-400">
              Special blind box!
            </p>
          )}
          {memberName && (
            <p className="mt-2 text-white/70">from {memberName}</p>
          )}
          {balance !== null && (
            <p className="mt-4 font-mono text-sm text-brand-1">
              Group balance: {balance}
            </p>
          )}
          <a href="/dashboard" className="btn-primary mt-10 min-w-[160px]">
            Continue
          </a>
        </div>
      )}
    </div>
  );
}
