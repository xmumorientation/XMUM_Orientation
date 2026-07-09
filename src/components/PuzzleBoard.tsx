"use client";

import { PIECES_PER_SET } from "@/lib/types";
import { cn } from "@/lib/utils";

// Renders one location's 5-piece puzzle. If Admin uploaded a picture for
// the location, owned pieces show their slice of it (5 vertical strips);
// otherwise a starfield placeholder. When complete, the strips merge into
// the full picture — the celebratory display the group shows the Guardian
// GM (DB remains the source of truth, FR-8.1).
export function PuzzleBoard({
  ownedIndices,
  imageUrl,
  complete,
  groupName,
}: {
  ownedIndices: number[];
  imageUrl: string | null;
  complete: boolean;
  groupName?: string | null;
}) {
  if (complete && imageUrl) {
    return (
      <div className="relative overflow-hidden rounded-xl border-2 border-star-goldsoft shadow-glow">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="Completed puzzle" className="block w-full" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-center">
          <p className="text-sm font-bold text-star-goldsoft">
            ✦ COMPLETE — show this to the Guardian ✦
          </p>
          {groupName && <p className="text-xs text-white/80">{groupName}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-1.5">
      {Array.from({ length: PIECES_PER_SET }, (_, i) => i + 1).map((idx) => {
        const owned = ownedIndices.includes(idx);
        return (
          <div
            key={idx}
            className={cn(
              "relative aspect-[2/3] overflow-hidden rounded-lg border",
              owned
                ? "border-star-goldsoft shadow-glow"
                : "border-dashed border-base-300 bg-base-100"
            )}
          >
            {owned && imageUrl ? (
              <div
                className="absolute inset-0 bg-cover"
                style={{
                  backgroundImage: `url(${imageUrl})`,
                  backgroundSize: `${PIECES_PER_SET * 100}% 100%`,
                  backgroundPosition: `${((idx - 1) / (PIECES_PER_SET - 1)) * 100}% 0`,
                }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center">
                <span className={cn("text-lg", owned && "drop-shadow")}>
                  {owned ? "🧩" : "❔"}
                </span>
                <span className="text-[10px] text-ink-faint">{idx}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
