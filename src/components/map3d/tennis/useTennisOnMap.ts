"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { LiveCourt } from "./board";
import type { OnMapView, TennisOnMap } from "./onMap";

// DRAFT: the tennis game on the map pages (docs/ROADMAP.md, item 9, batch T3b), for CampusMap3DView. While Admin has
// the game open (Live control), it loads the game's code (TennisMap.tsx) and joins the courts' board, so the map
// shows the matches. When Admin turns it off, it closes at once: a match being played ends, the queue empties, and
// the court's card (Play) goes.

/** The area of the map's tennis court (map3d/places.ts): a tap on it opens the court's card. */
export const TENNIS_AREA = "Tennis Court";

export type TennisSettings = {
  /** Admin has the game open (Live control, game_config "tennis_open"). */
  open: boolean;
  /**
   * Who plays on this phone: a Freshie or Faci in their group's name and colour, anyone else in their role's name
   * and the default blue (Ben, 2026-10-27).
   */
  profile: { name: string; color: string };
  /** Supabase Realtime, or (the dev preview, /map3d/preview?tennis=1) BroadcastChannel between tabs. */
  net: "realtime" | "tabs";
};

type Loaded = { mod: typeof import("./TennisMap"); courts: TennisOnMap };

const IDLE: OnMapView = { phase: "idle", lobby: null, match: null };
const idle = () => IDLE;
const NO_COURTS: LiveCourt[] = [];
const noCourts = () => NO_COURTS;
const noSubscribe = () => () => {};

/** `fullscreen`: the map's full-screen viewer is open; closing it leaves the queue (and the match). */
export function useTennisOnMap(settings: TennisSettings | null | undefined, fullscreen: boolean) {
  const open = settings?.open ?? false;
  const net = settings?.net ?? "realtime";
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // the court's card, after a tap on the court
  const [card, setCard] = useState(false);
  // Admin closed the game while this phone was in the queue or a match
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let on = true;
    let made: TennisOnMap | null = null;
    import("./TennisMap").then((mod) =>
      mod.openTennisOnMap(net).then((courts) => {
        if (!on) return courts.close();
        made = courts;
        setLoaded({ mod, courts });
        setClosed(false);
      }),
    );
    // the page is going: leave every room now, so the other player knows at once
    const onHide = () => made?.close();
    window.addEventListener("pagehide", onHide);
    return () => {
      on = false;
      window.removeEventListener("pagehide", onHide);
      if (made && made.getView().phase !== "idle") setClosed(true);
      made?.close();
      setLoaded(null);
      setCard(false);
    };
  }, [open, net]);

  const courts = loaded?.courts ?? null;
  // closing full screen leaves the queue, or the match (Escape)
  useEffect(() => {
    if (fullscreen) return;
    courts?.leave();
    setCard(false);
  }, [fullscreen, courts]);

  const view = useSyncExternalStore(courts?.subscribe ?? noSubscribe, courts?.getView ?? idle, courts?.getView ?? idle);
  const busy = useSyncExternalStore(
    courts?.board.subscribe ?? noSubscribe,
    courts?.board.getView ?? noCourts,
    courts?.board.getView ?? noCourts,
  );
  const profile = settings?.profile;
  const play = useCallback(() => {
    if (!courts || !profile) return;
    courts.play(profile);
    // the queue shows on the card; after the match, the map is left as it was
    setCard(false);
  }, [courts, profile]);
  const playBot = useCallback(() => {
    if (!courts || !profile) return;
    if (courts.playBot(profile)) setCard(false);
  }, [courts, profile]);

  return {
    /** The game is open and its code has loaded: the courts show their matches, and the court's card can open. */
    loaded,
    /** Admin has the game open. */
    open,
    view,
    /** A match is on one of the courts: the map's "Tennis Court" label says LIVE. */
    live: busy.length > 0,
    /** This phone's match is on screen: it takes the screen and the camera. */
    playing: loaded !== null && view.phase === "match",
    /** The court's card shows: after a tap on the court, and while this phone waits in the queue. */
    card: loaded !== null && (card || view.phase === "queue"),
    showCard: useCallback(() => setCard(true), []),
    hideCard: useCallback(() => setCard(false), []),
    play,
    playBot,
    /** Admin closed the game while this phone was playing or queued: say so, until dismissed. */
    closed,
    dismissClosed: useCallback(() => setClosed(false), []),
  };
}
