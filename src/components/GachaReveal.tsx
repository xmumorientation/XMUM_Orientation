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
        : "Empty-handed"
      : result.label;

  const prizeCode =
    result.kind === "tokens"
      ? result.token_amount >= 6
        ? "BIG"
        : result.token_amount > 0
          ? "TOK"
          : "NIL"
      : result.is_gala
        ? "GALA"
        : result.kind === "clue"
          ? "CLUE"
          : "CARD";

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-night-900 px-6"
      onClick={() => (stage === "shaking" ? setStage("revealed") : onClose())}
    >
      {stage === "shaking" ? (
        <>
          <div className="animate-shake rounded-[2rem] border border-white/10 bg-white/5 px-10 py-8 text-5xl font-black tracking-[-0.06em] text-white shadow-[0_0_80px_rgba(245,197,66,0.22)]">
            DRAW
          </div>
          <p className="mt-8 text-sm text-white/60">Tap to skip</p>
        </>
      ) : (
        <div className="animate-burst flex flex-col items-center text-center">
          <div className="rounded-[2rem] border border-star-goldsoft/30 bg-star-goldsoft/10 px-8 py-6 text-5xl font-black tracking-[-0.06em] text-star-goldsoft shadow-[0_0_60px_rgba(245,197,66,0.28)]">
            {prizeCode}
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
