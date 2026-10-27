import { Board, hostOnBoard } from "./board";
import type { LobbyView } from "./lobby";
import type { Transport } from "./net";
import { Online } from "./online";
import { playerProfile, shirtsOf } from "./shirts";

// DRAFT: the tennis game on the map pages (docs/ROADMAP.md, item 9, batch T3b), while Admin has it open. One
// transport and one courts board for the page: everyone with the map open watches the courts on it (TennisLive.tsx),
// and a phone that hosts a match says it there too (hostOnBoard), since a phone may be in a room only once. The seat
// in the queue is made on the first Play. close() leaves every room: Admin closed the game, or the map is gone.

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

type Profile = { name: string; color: string };

const IDLE: OnMapView = { phase: "idle", lobby: null, match: null };

export class TennisOnMap {
  readonly board: Board;
  /** This phone's seat, from its first Play, and the name and shirt it plays in. */
  online: Online | null = null;
  profile: Profile | null = null;
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
    if (this.closed) return;
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

  /** Off the court (mid-match the other player wins) and out of the queue: the end card's Leave, or the map closed. */
  leave() {
    this.online?.leave();
  }

  /** Leaves every room: the game's queue and match, and the courts' board. Nothing works after it. */
  close() {
    if (this.closed) return;
    this.closed = true;
    this.online?.close();
    this.stops.forEach((s) => s());
    this.board.close();
    this.set(IDLE);
  }

  private update() {
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
