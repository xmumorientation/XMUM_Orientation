import { Link, type LinkView } from "./link";
import { Lobby, parseKey, type LobbyView, type Seat } from "./lobby";
import type { Who } from "./match";
import type { Transport } from "./net";

// DRAFT: the tennis game online (docs/ROADMAP.md, item 9, batch T2a): this phone's seat in the courts' queue and
// its match, if it has one. The HUD reads one view from it, and the court draws its match.

export type OnlineView = {
  lobby: LobbyView;
  /** This phone's match: its court, the other player, and how it stands. Kept after it closes, until dismissed. */
  match: { key: string; court: number; host: boolean; opponent: Seat; link: LinkView } | null;
};

/** Between frames (the map draws on demand), the match still moves on this often: timeouts, resends, the clock. */
const TICK_MS = 250;

export class Online {
  readonly lobby: Lobby;
  link: Link | null = null;
  private opponent: Seat | null = null;
  private view: OnlineView;
  private readonly listeners = new Set<() => void>();
  private readonly ticker: ReturnType<typeof setInterval> | null;

  /**
   * `local`: who plays on this phone; a bot ("bot", two-bot screenshots and tests) queues at once and always
   * rematches. `clock`: this phone's time (s) for the match; `wall`: the time (ms) the queue is ordered by, the
   * same on every phone (Date.now). `ticker`: tick between frames as well (off in tests, which tick by hand).
   */
  constructor(
    private readonly transport: Transport,
    profile: { name: string; color: string },
    private readonly local: Who = "player",
    private readonly clock: () => number = () => performance.now() / 1000,
    ticker = true,
    wall: () => number = Date.now,
  ) {
    this.lobby = new Lobby(transport, profile, wall);
    this.view = { lobby: this.lobby.getView(), match: null };
    this.lobby.subscribe(() => this.onLobby());
    this.ticker = ticker ? setInterval(() => this.tick(), TICK_MS) : null;
    if (local === "bot") this.lobby.play();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getView = () => this.view;

  /** Into the queue. */
  play() {
    this.lobby.play();
  }

  /** Out of the queue. */
  cancel() {
    this.lobby.stop();
  }

  /** After a match: the end card goes, and this player queues again. */
  playAgain() {
    this.leave();
    this.lobby.play();
  }

  /** Off the court: mid-match the other player wins. */
  leave() {
    const link = this.link;
    this.link = null;
    link?.close("left");
    this.dismiss();
    this.lobby.stop();
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
    this.lobby.close();
  }

  private dismiss() {
    this.link = null;
    this.opponent = null;
    this.emit();
  }

  private onLobby() {
    const { me, seats } = this.lobby.getView();
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
        this.lobby.requeue(true);
      } else {
        // the court is free again; the end card stays until the player chooses
        this.lobby.stop();
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
      lobby: this.lobby.getView(),
      match:
        link && opponent
          ? { key: link.key, court: parseKey(link.key).court, host: link.host, opponent, link: link.getView() }
          : null,
    };
    this.listeners.forEach((fn) => fn());
  }
}
