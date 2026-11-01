import { Link, type LinkView } from "./link";
import { Lobby, parseKey, type LobbyView, type Seat } from "./lobby";
import type { Who } from "./match";
import type { Transport } from "./net";

// DRAFT: the tennis game online (docs/ROADMAP.md, item 9, batches T2a and T2b): this phone's seat in the courts'
// queue and its match, if it has one. The HUD reads one view from it, and the court draws its match. A phone is in
// the queue's room only from Play until it goes back to idle: presence goes to every member of a room, so a room
// everyone with the map open were in would cost the most (T2b, Supabase Realtime).

export type OnlineView = {
  /** The queue, while this phone is in its room (from Play); null before. */
  lobby: LobbyView | null;
  /** This phone's match: its court, the other player, and how it stands. Kept after it closes, until dismissed. */
  match: { key: string; court: number; host: boolean; opponent: Seat; link: LinkView } | null;
};

/** Between frames (the map draws on demand), the match still moves on this often: timeouts, resends, the clock. */
const TICK_MS = 250;

export class Online {
  link: Link | null = null;
  private lobby: Lobby | null = null;
  /** Matches this phone has played, across its turns in the queue: a finished one must never pull it back in. */
  private readonly finished = new Set<string>();
  private opponent: Seat | null = null;
  private view: OnlineView = { lobby: null, match: null };
  private readonly listeners = new Set<() => void>();
  private readonly ticker: ReturnType<typeof setInterval> | null;

  /**
   * `local`: who plays on this phone; a bot ("bot", two-bot screenshots and tests) queues at once and always
   * rematches. `clock`: this phone's time (s) for the match; `wall`: the time (ms) the queue is ordered by, the
   * same on every phone (Date.now). `ticker`: tick between frames as well (off in tests, which tick by hand).
   */
  constructor(
    private readonly transport: Transport,
    private readonly profile: { name: string; color: string },
    private readonly local: Who = "player",
    private readonly clock: () => number = () => performance.now() / 1000,
    ticker = true,
    private readonly wall: () => number = Date.now,
  ) {
    this.ticker = ticker ? setInterval(() => this.tick(), TICK_MS) : null;
    if (local === "bot") this.play();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getView = () => this.view;

  /** Into the queue (and its room). */
  play() {
    if (!this.lobby) {
      this.lobby = new Lobby(this.transport, this.profile, this.wall, this.finished);
      this.lobby.subscribe(() => this.onLobby());
    }
    this.lobby.play();
  }

  /** Out of the queue, and out of its room. */
  cancel() {
    this.out();
  }

  /** After a match: the end card goes, and this player queues again. */
  playAgain() {
    this.leave();
    this.play();
  }

  /** Off the court (mid-match the other player wins), and out of the queue's room. */
  leave() {
    const link = this.link;
    this.link = null;
    link?.close("left");
    this.opponent = null;
    this.out();
  }

  rematch(yes: boolean) {
    this.link?.wantRematch(yes);
  }

  /** Every frame while there is a match. */
  tick(now = this.clock()) {
    this.link?.tick(now);
  }

  /** The tab was hidden or shown. */
  setAway(away: boolean) {
    this.link?.setAway(away);
  }

  /** The page is going: leave every room, so the others know at once. */
  close() {
    if (this.ticker) clearInterval(this.ticker);
    this.link?.close("left");
    this.out();
  }

  /** Leaves the queue's room (an idle seat first, so the others see it go at once). */
  private out() {
    const lobby = this.lobby;
    this.lobby = null;
    if (lobby) {
      lobby.stop();
      lobby.close();
    }
    this.emit();
  }

  private onLobby() {
    const lobby = this.lobby;
    if (!lobby) return;
    const { me, seats } = lobby.getView();
    const live = this.link && this.link.getView().phase !== "closed";
    if (me.status === "play" && me.match && this.link?.key !== me.match) {
      // a new match: meet the other player in its room
      this.link?.close("left");
      this.link = new Link(this.transport, me.match, parseKey(me.match).host === me.id, this.local, this.clock);
      this.link.subscribe(() => this.onLink());
    } else if (me.status === "queue" && live && this.link?.getView().round === 0) {
      // the court went to a pair that queued first: this match never started
      this.link?.close("timeout");
      this.link = null;
    }
    if (this.link) {
      const { host, guest } = parseKey(this.link.key);
      this.opponent = seats.find((s) => s.id === (host === me.id ? guest : host)) ?? this.opponent;
    }
    this.emit();
  }

  private onLink() {
    const link = this.link;
    if (!link) return;
    const v = link.getView();
    if (v.phase === "closed") {
      if (v.round === 0) {
        // the other phone never came: back to the same place in the queue
        this.link = null;
        this.lobby?.requeue(true);
      } else {
        // the court is free again; the end card stays until the player chooses
        this.out();
      }
    } else if (this.local === "bot" && v.phase === "over" && v.rematch.me === null) {
      link.wantRematch(true);
    }
    this.emit();
  }

  private emit() {
    const link = this.link;
    const opponent = this.opponent;
    this.view = {
      lobby: this.lobby?.getView() ?? null,
      match:
        link && opponent
          ? { key: link.key, court: parseKey(link.key).court, host: link.host, opponent, link: link.getView() }
          : null,
    };
    this.listeners.forEach((fn) => fn());
  }
}
