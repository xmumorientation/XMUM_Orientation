"use client";

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
          <div className="animate-shake text-8xl">📦</div>
          <p className="mt-8 text-sm text-white/60">Tap to skip</p>
        </>
      ) : (
        <div className="animate-burst flex flex-col items-center text-center">
          <div
            className={
              special
                ? "text-8xl drop-shadow-[0_0_40px_rgba(245,197,66,0.9)]"
                : "text-8xl drop-shadow-[0_0_24px_rgba(103,232,249,0.7)]"
            }
          >
            {special ? "💰" : "✨"}
          </div>
          <p className="mt-6 text-3xl font-extrabold text-white">
            +{tokens} Token{tokens !== 1 ? "s" : ""}
          </p>
          {special && (
            <p className="mt-2 animate-pulseglow text-lg font-semibold text-star-goldsoft">
              ★ Special blind box! ★
            </p>
          )}
          {memberName && (
            <p className="mt-2 text-white/70">from {memberName}</p>
          )}
          {balance !== null && (
            <p className="mt-4 text-sm text-star-cyansoft">
              Group balance: {balance} ✦
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
