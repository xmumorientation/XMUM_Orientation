"use client";

import { Coins, Package, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

// Blind box opening — hero moment. Shaking box → token burst.
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
  const [stage, setStage] = useState<"shaking" | "revealed">("shaking");

  useEffect(() => {
    const t = setTimeout(() => setStage("revealed"), 2200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-night-900 px-6"
      onClick={() => stage === "shaking" && setStage("revealed")}
    >
      {stage === "shaking" ? (
        <>
          <div className="animate-shake">
            <Package size={96} strokeWidth={1.25} className="text-white" />
          </div>
          <p className="mt-8 text-sm text-white/60">Tap to skip</p>
        </>
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
