"use client";

import { useEffect, useState } from "react";

import type { GachaResult } from "@/lib/types";

// FR-7.5: shaking box → burst reveal, ~3-4s, skippable. This is one of the
// two "hero moments" that go dark & theatrical (proposal §7).
export function GachaReveal({
  result,
  onClose,
}: {
  result: GachaResult;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<"shaking" | "revealed">("shaking");

  useEffect(() => {
    const t = setTimeout(() => setStage("revealed"), 2200);
    return () => clearTimeout(t);
  }, []);

  const prize =
    result.kind === "tokens"
      ? result.token_amount > 0
        ? `+${result.token_amount} Tokens`
        : "Empty-handed…"
      : result.label;

  const emoji =
    result.kind === "tokens"
      ? result.token_amount >= 6
        ? "💰"
        : result.token_amount > 0
          ? "✨"
          : "💨"
      : result.is_gala
        ? "🌟"
        : result.kind === "clue"
          ? "🗺️"
          : "🎠";

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-night-900 px-6"
      onClick={() => (stage === "shaking" ? setStage("revealed") : onClose())}
    >
      {stage === "shaking" ? (
        <>
          <div className="animate-shake text-8xl">🎁</div>
          <p className="mt-8 text-sm text-white/60">Tap to skip</p>
        </>
      ) : (
        <div className="animate-burst flex flex-col items-center text-center">
          <div className="text-8xl drop-shadow-[0_0_30px_rgba(245,197,66,0.8)]">
            {emoji}
          </div>
          <p className="mt-6 text-2xl font-bold text-white">{prize}</p>
          {result.is_gala && (
            <p className="mt-2 animate-pulseglow text-lg font-semibold text-star-goldsoft">
              ★ The hidden Gala Night card! ★
            </p>
          )}
          {result.bonus_tokens > 0 && (
            <p className="mt-2 text-star-cyansoft">
              +{result.bonus_tokens} bonus tokens
            </p>
          )}
          <button className="btn-primary mt-10 min-w-[160px]" onClick={onClose}>
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
