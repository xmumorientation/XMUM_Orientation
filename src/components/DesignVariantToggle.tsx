"use client";

import { useDesignVariant } from "@/components/DesignVariantProvider";
import { cn } from "@/lib/utils";

// Segmented switch so people can compare the shipped screens against the
// soft redesign and keep whichever they prefer — shown on dashboard, map,
// gm and admin via AppShell; bigscreen reads the same saved preference
// without its own control, since it's a passive projector display.
export function DesignVariantToggle({ compact = false }: { compact?: boolean }) {
  const { variant, setVariant } = useDesignVariant();

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-paper-300 bg-white p-0.5 text-xs font-bold",
        compact ? "w-full" : ""
      )}
      role="group"
      aria-label="Design preview"
    >
      <button
        type="button"
        onClick={() => setVariant("classic")}
        className={cn(
          "min-h-[32px] rounded-full px-3 transition",
          compact && "flex-1",
          variant === "classic"
            ? "bg-ink text-white"
            : "text-ink-faint hover:text-ink"
        )}
      >
        Classic
      </button>
      <button
        type="button"
        onClick={() => setVariant("soft")}
        className={cn(
          "min-h-[32px] rounded-full px-3 transition",
          compact && "flex-1",
          variant === "soft"
            ? "bg-ink text-white"
            : "text-ink-faint hover:text-ink"
        )}
      >
        Soft (preview)
      </button>
    </div>
  );
}
