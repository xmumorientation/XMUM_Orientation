import { Board, hostOnBoard } from "./board";
import { COURT_ORDER, type LobbyView } from "./lobby";
import type { Room, Transport } from "./net";
import { Online } from "./online";
import { playerProfile, shirtsOf } from "./shirts";

// DRAFT: the tennis game on the map pages (docs/ROADMAP.md, item 9, batch T3b), while Admin has it open. One
// transport and one courts board for the page: everyone with the map open watches the courts on it (TennisLive.tsx),
// and a phone that hosts a match says it there too (hostOnBoard), since a phone may be in a room only once. The seat
// in the queue is made on the first Play. close() leaves every room: Admin closed the game, or the map is gone.
//
// Play with Bot (2026-10-27): a practice match against the bot, with no queue and no other phone, still takes a
// court (so it counts against the 3) and shows on the board like a real match, but the match itself (TennisMap.tsx's
// botGame()) plays entirely on this phone, so it is not built here (this file stays free of React and the game's
// own simulation, so its tests stay plain). The seat joins the match's room, where relay.ts sends the match to its
// watchers. Only one of Play or Play with Bot runs at once.

export type OnMapPhase = "idle" | "queue" | "match";

export type OnMapView = {
  /**
   * idle: not playing; queue: in the queue (from Play until a match comes); match: this phone's match is on screen,
   * from "vs …" until its end card is closed.
   */
  phase: OnMapPhase;
  /** The queue, while this phone is in its room. */
  lobby: LobbyView | null;
  /** This phone's match (its key), drawn by the game rather than the spectators' view. */
  match: string | null;
};

export type Profile = { name: string; color: string };

/** This phone's practice match against the bot: its court and board key, who it plays as, and its watchers' room. */
export type BotSeat = { key: string; court: number; profile: Profile; room: Room };

const IDLE: OnMapView = { phase: "idle", lobby: null, match: null };

export class TennisOnMap {
  readonly board: Board;
  /** This phone's seat, from its first Play, and the name and shirt it plays in. */
  online: Online | null = null;
  profile: Profile | null = null;
  /** This phone's practice match against the bot, from Play with Bot until Leave. */
  bot: BotSeat | null = null;
  private view: OnMapView = IDLE;
  private readonly listeners = new Set<() => void>();
  private readonly stops: (() => void)[] = [];
  private closed = false;

  /** `seat`: makes this phone's seat (tests pass a clock); by default an Online on `transport`. */
  constructor(
    readonly transport: Transport,
    private readonly seat: (profile: Profile) => Online = (p) => new Online(transport, p),
  ) {
    this.board = new Board(transport);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getView = () => this.view;

  /** Into the queue, as `who` (a name and a group colour): the name and shirt are kept from the first Play. */
  play(who: Profile) {
    if (this.closed || this.bot) return;
    if (!this.online) {
      const profile = (this.profile = playerProfile(who.name, who.color));
      const online = (this.online = this.seat(profile));
      this.stops.push(
        online.subscribe(() => this.update()),
        hostOnBoard(online, () => this.board, (theirs) => shirtsOf(profile.color, theirs)),
      );
    }
    this.online.play();
  }

  /** Out of the queue. */
  cancel() {
    this.online?.cancel();
  }

  /**
   * A practice match against the bot, as `who`, taking the first free court (busiest first, as the queue would
   * fill them): true once it has one. False and no match when all three are taken, or this phone already plays.
   */
  playBot(who: Profile): boolean {
    if (this.closed || this.bot || this.view.phase !== "idle") return false;
    const busy = new Set(this.board.getView().map((c) => c.court));
    const court = COURT_ORDER.find((c) => !busy.has(c));
    if (court === undefined) return false;
    const profile = playerProfile(who.name, who.color);
    const key = `${court}:bot:${Math.random().toString(36).slice(2, 10)}:${Date.now().toString(36)}`;
    this.bot = { key, court, profile, room: this.transport.join(`match:${key}`) };
    this.board.say({ court, key, colors: shirtsOf(profile.color, profile.color) });
    this.set({ phase: "match", lobby: null, match: key });
    return true;
  }

  /** Off the court (mid-match the other player wins) and out of the queue: the end card's Leave, or the map closed. */
  leave() {
    if (this.bot) {
      this.bot.room.leave();
      this.bot = null;
      this.board.say(null);
      this.set(IDLE);
      return;
    }
    this.online?.leave();
  }

  /** Leaves every room: the game's queue and match, and the courts' board. Nothing works after it. */
  close() {
    if (this.closed) return;
    this.closed = true;
    this.online?.close();
    if (this.bot) {
      this.bot.room.leave();
      this.bot = null;
      this.board.say(null);
    }
    this.stops.forEach((s) => s());
    this.board.close();
    this.set(IDLE);
  }

  private update() {
    // the bot match is not the online seat's, and nothing here moves it on
    if (this.bot) return;
    const v = this.online?.getView();
    const match = v?.match?.key ?? null;
    const seat = v?.lobby?.me.status;
    this.set({
      // a seat already playing whose match is still being set up still waits, to the player
      phase: match ? "match" : seat === "queue" || seat === "play" ? "queue" : "idle",
      lobby: v?.lobby ?? null,
      match,
    });
  }

  private set(view: OnMapView) {
    const v = this.view;
    if (v.phase === view.phase && v.lobby === view.lobby && v.match === view.match) return;
    this.view = view;
    this.listeners.forEach((fn) => fn());
  }
}
