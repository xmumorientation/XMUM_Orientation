"use client";

import { Lightbulb, Move, RotateCcw } from "lucide-react";

import { PROJECTOR_CODE_NAMES, PROJECTOR_LABELS, type MapLightbulb, type ProjectorLocation } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

export function bulbTitle(b: MapLightbulb) {
  return `${PROJECTOR_CODE_NAMES[b.location]} · ${PROJECTOR_LABELS[b.location]}`;
}

// fn_map_lightbulbs (0096) gives the group only to Committee tier and to the
// group that lit the bulb; everyone else sees "Lit at".
export function bulbStatus(b: MapLightbulb, nowMs: number) {
  if (!b.activated_at) return "Not lit yet";
  const at = new Date(b.activated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const by = b.group_name ?? (b.activated_by_group != null ? `Group ${b.activated_by_group}` : null);
  return `${by ? `Lit by ${by}` : "Lit"} at ${at} (${timeAgo(b.activated_at, nowMs)})${b.activated_manually ? " · set by Admin" : ""}`;
}

/** The lightbulbs the viewer may see: under the 2D map in Lightbulbs mode, always under the 3D map. */
export function LightbulbList({
  bulbs,
  nowMs,
  selected,
  onSelect,
  canManage,
  moving,
  onMove,
  resetting,
  onReset,
}: {
  bulbs: MapLightbulb[];
  nowMs: number;
  selected: ProjectorLocation | null;
  onSelect: (location: ProjectorLocation) => void;
  /** Admin: reset buttons, and Move buttons when `onMove` is given (the 2D map only). */
  canManage: boolean;
  moving: ProjectorLocation | null;
  onMove?: (location: ProjectorLocation | null) => void;
  /** Bulb whose reset is in progress. */
  resetting: ProjectorLocation | null;
  /** Admin: turn a lit bulb off again. */
  onReset: (location: ProjectorLocation) => void;
}) {
  const lit = bulbs.filter((b) => b.activated_at).length;
  return (
    <section className="card mt-3 overflow-hidden p-0">
      <h2 className="border-b border-paper-200 px-3 py-2 text-sm font-semibold">
        Projectors · {lit} lit
      </h2>
      <ul className="divide-y divide-paper-200">
        {bulbs.map((b) => (
          <li
            key={b.location}
            className={`flex items-center gap-3 px-3 py-2.5 ${selected === b.location ? "bg-amber-50" : ""}`}
          >
            <button
              type="button"
              onClick={() => onSelect(b.location)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  b.activated_at ? "bg-amber-400 text-white shadow-[0_0_12px_#fbbf24]" : "bg-stone-200 text-stone-500"
                }`}
              >
                <Lightbulb className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{bulbTitle(b)}</span>
                <span className="block truncate text-xs text-ink-faint">{bulbStatus(b, nowMs)}</span>
              </span>
            </button>
            {canManage && b.activated_at && (
              <button
                type="button"
                onClick={() => onReset(b.location)}
                disabled={resetting === b.location}
                className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border border-paper-200 px-2.5 text-xs font-semibold hover:bg-paper-100 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {resetting === b.location ? "Resetting…" : "Reset"}
              </button>
            )}
            {canManage && onMove && (
              <button
                type="button"
                onClick={() => onMove(moving === b.location ? null : b.location)}
                aria-pressed={moving === b.location}
                className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border border-paper-200 px-2.5 text-xs font-semibold hover:bg-paper-100"
              >
                <Move className="h-3.5 w-3.5" />
                {moving === b.location ? "Cancel" : "Move"}
              </button>
            )}
          </li>
        ))}
        {bulbs.length === 0 && (
          <li className="px-3 py-4 text-sm text-ink-faint">
            No projector is lit yet. The other places stay secret until the map unlocks.
          </li>
        )}
      </ul>
      {bulbs.length > 0 && bulbs.length < 3 && (
        <p className="border-t border-paper-200 px-3 py-2 text-xs text-ink-faint">
          Unlit projectors stay secret until the map unlocks.
        </p>
      )}
    </section>
  );
}
