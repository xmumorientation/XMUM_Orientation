import type { Payload, Room, Transport } from "./net";
import type { Online } from "./online";

// DRAFT: which tennis courts have a match on, for everyone with the map open (docs/ROADMAP.md, item 9, batch
// T3a). Each match's host is in the "courts" room's presence while its match is on: its court, the match, and both
// players' shirts. Everyone else is in the room with no presence of their own, so a phone that opens the map learns
// the busy courts at once (the presence it gets on joining) and then hears only a match starting or ending, never
// the play itself. Names and score are not shown from afar (Ben, 2026-10-27).

export type LiveCourt = { court: number; key: string; colors: [string, string] };

/** A match's key, as lobby.ts makes it (court, host, guest, when the host queued): it names a Realtime channel. */
const KEY = /^[0-2]:[a-z0-9]{1,16}:[a-z0-9]{1,16}:[a-z0-9]{1,16}$/;
const HEX = /^#[0-9a-f]{6}$/i;

/** Another phone's presence as a busy court, if it is one (it comes from any phone, so it is checked). */
function liveCourt(s: Payload): LiveCourt | null {
  const { court, key, colors } = s;
  if (typeof court !== "number" || typeof key !== "string" || !KEY.test(key) || Number(key[0]) !== court) return null;
  if (!Array.isArray(colors) || colors.length !== 2 || !colors.every((c) => typeof c === "string" && HEX.test(c))) return null;
  return { court, key, colors: [colors[0], colors[1]] };
}

export class Board {
  private readonly room: Room;
  private readonly stop: () => void;
  private view: LiveCourt[] = [];
  private text = "[]";
  /** What this phone says about its own match (as JSON), or null. */
  private mine: string | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(t: Transport) {
    this.room = t.join("courts");
    this.stop = this.room.onPresence((states) => this.onPresence(states));
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  /** The busy courts, in court order. The same array until one changes. */
  getView = () => this.view;

  /** This phone hosts a match that is on (from its countdown until it closes), or null: not any more. */
  say(live: LiveCourt | null) {
    const text = live && JSON.stringify(live);
    if (text === this.mine) return;
    this.mine = text;
    if (live) this.room.track({ court: live.court, key: live.key, colors: live.colors });
    else this.room.untrack();
  }

  close() {
    this.stop();
    this.room.leave();
  }

  private onPresence(states: Map<string, Payload>) {
    const byCourt = new Map<number, LiveCourt>();
    for (const s of states.values()) {
      const live = liveCourt(s);
      // two pairs can claim a court for a moment (lobby.ts ownsCourt): one shows, the same on every phone
      const had = live && byCourt.get(live.court);
      if (live && (!had || live.key < had.key)) byCourt.set(live.court, live);
    }
    const view = [...byCourt.values()].sort((a, b) => a.court - b.court);
    const text = JSON.stringify(view);
    if (text === this.text) return;
    this.text = text;
    this.view = view;
    this.listeners.forEach((fn) => fn());
  }
}

/**
 * Puts this phone's online match on the board while it hosts one that is on (from its countdown until it closes).
 * `board`: the board to say it on, asked for when first needed. A page that shows the courts passes its own (T3b):
 * a phone may be in a room only once. `colors`: both shirts as the players see them (host first), from the other
 * player's group colour.
 */
export function hostOnBoard(online: Online, board: () => Board, colors: (theirs: string) => [string, string]) {
  let on: Board | null = null;
  return online.subscribe(() => {
    const m = online.getView().match;
    if (m?.host && m.link.round > 0 && m.link.phase !== "closed") {
      on ??= board();
      on.say({ court: m.court, key: m.key, colors: colors(m.opponent.color) });
    } else on?.say(null);
  });
}
