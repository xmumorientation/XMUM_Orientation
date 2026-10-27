"use client";

import { useThree } from "@react-three/fiber";
import { X } from "lucide-react";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { MapControls as MapControlsImpl } from "three-stdlib";

import type { Online } from "./online";
import { TennisOnMap } from "./onMap";
import { CourtSurface } from "./surface";
import { onlineGame, openTransport, queueStatus, TennisCourt, TennisHud, type Game, type TennisOptions } from "./TennisGame";
import { LiveCourts } from "./TennisLive";

// DRAFT: the tennis game on the map pages (docs/ROADMAP.md, item 9, batch T3b): the courts in the scene (every busy
// court, this phone's match), the tennis court's card (Play, the queue) and the match's HUD. useTennisOnMap loads
// this file only while Admin has the game open, so the map's own chunk does not grow.

/** The page's courts: one transport and one board (onMap.ts). */
export async function openTennisOnMap(net: TennisOptions["net"]) {
  return new TennisOnMap(await openTransport(net));
}

const games = new WeakMap<Online, Game>();

/** The game for this phone's seat, the same object for as long as the seat lasts (TennisCourt and TennisHud share it). */
function gameOf(courts: TennisOnMap): Game | null {
  const { online, profile } = courts;
  if (!online || !profile) return null;
  let game = games.get(online);
  if (!game) games.set(online, (game = onlineGame(online, profile)));
  return game;
}

/**
 * The courts in the map's scene: the crisp courts, every busy court as a spectator sees it, and this phone's own
 * match, which takes the camera. The phone watches a match up close only in full screen and while it does not play.
 */
export function TennisScene({ courts, fullscreen }: { courts: TennisOnMap; fullscreen: boolean }) {
  const view = useSyncExternalStore(courts.subscribe, courts.getView, courts.getView);
  const spectator = useMemo(() => ({ transport: courts.transport, board: courts.board }), [courts]);
  const game = view.match ? gameOf(courts) : null;
  // the match owns the camera, so the map's controls are off while it plays (as on /map3d?tennis=online). CampusScene
  // turns them on in full screen (and off in the card); this gives them back as that, also when the game closes.
  const controls = useThree((s) => s.controls) as unknown as MapControlsImpl | null;
  const playing = view.match !== null;
  useEffect(() => {
    if (!controls || !playing) return;
    controls.enabled = false;
    return () => {
      controls.enabled = fullscreen;
    };
  }, [controls, fullscreen, playing]);
  return (
    <>
      <CourtSurface />
      <LiveCourts spectator={spectator} exclude={view.match} watch={fullscreen && !playing} surface={false} />
      {game && <TennisCourt game={game} rest={false} surface={false} />}
    </>
  );
}

/** This phone's match over the map: the broadcast's score, the calls, the controls and the end card. */
export function TennisMatchHud({ courts }: { courts: TennisOnMap }) {
  const game = gameOf(courts);
  return game ? <TennisHud game={game} exit="Back to map" /> : null;
}

/**
 * The tennis court's card, after a tap on the court: Play, then where this phone stands in the queue. `accent` and
 * `onAccent`: the page's colour (the group's, or the Welcome cyan) and the text on it. `onStations`: Admin's
 * building panel for the court, which a tap on the court opens while the game is closed.
 */
export function TennisCard({
  courts,
  onPlay,
  onClose,
  onStations,
  accent,
  onAccent,
}: {
  courts: TennisOnMap;
  onPlay: () => void;
  onClose: () => void;
  onStations?: () => void;
  accent: string;
  onAccent: string;
}) {
  const view = useSyncExternalStore(courts.subscribe, courts.getView, courts.getView);
  const busy = useSyncExternalStore(courts.board.subscribe, courts.board.getView, courts.board.getView).length;
  const queued = view.phase === "queue";
  return (
    <div className="pointer-events-auto rounded-2xl bg-white px-3 py-2.5 text-sm text-stone-900 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-semibold">
            Tennis
            {busy > 0 && (
              <span className="rounded-full bg-rose-600 px-1.5 py-px text-[10px] font-bold tracking-wide text-white">
                <span className="motion-safe:animate-pulse">●</span> LIVE
              </span>
            )}
          </div>
          <div className="text-xs text-ink-faint" aria-live="polite">
            {queued && view.lobby
              ? queueStatus(view.lobby)
              : `${busy > 0 ? `${busy} of 3 courts in play` : "All 3 courts are free"} · First to 5 points`}
          </div>
        </div>
        {!queued && (
          <button
            type="button"
            aria-label="Close tennis"
            className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        {queued ? (
          <button
            type="button"
            className="h-11 flex-1 rounded-full font-bold text-stone-900 ring-1 ring-black/15"
            onClick={() => courts.cancel()}
          >
            Cancel
          </button>
        ) : (
          <>
            <button
              type="button"
              className="h-11 flex-1 rounded-full font-bold"
              style={{ background: accent, color: onAccent }}
              onClick={onPlay}
            >
              Play
            </button>
            {onStations && (
              <button
                type="button"
                className="h-11 rounded-full px-4 font-semibold text-stone-900 ring-1 ring-black/15"
                onClick={onStations}
              >
                Stations
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
