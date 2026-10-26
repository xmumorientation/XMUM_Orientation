import type { Payload, Room, Transport } from "./net";

// DRAFT: the tennis courts' queue (docs/ROADMAP.md, item 9, batch T2a): at most three matches at once, one per
// court, and everyone else waits. Everyone with the game open is in one room, and their presence says who waits
// and who plays where. There is no server: each member works out the same pairs from the same presence
// (pairings()), and a pair starts once both of them have asked for it.

/** Courts in the order they fill: the middle one first, where the map's broadcast view starts. */
export const COURT_ORDER = [1, 0, 2];

export type Seat = {
  id: string;
  name: string;
  color: string;
  status: "idle" | "queue" | "play";
  /** When they joined the queue (their own clock, ms): the queue's order. */
  since: number;
  /** While queued: the pair they think is due (Pair.key). */
  want: string | null;
  /** While playing: the court and the match (its Pair.key). */
  court: number | null;
  match: string | null;
};

/**
 * A match that is due: on which court, who hosts it (the first of the two in the queue) and who joins. Its key
 * names the court, both players and when the host queued, so the same two meeting again later is a new match.
 */
export type Pair = { key: string; court: number; host: string; guest: string };

export const parseKey = (key: string) => {
  const [court, host, guest] = key.split(":");
  return { court: Number(court), host, guest };
};

const byQueue = (a: Seat, b: Seat) => a.since - b.since || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The queue in order: the first is next to play. */
export function queueOf(seats: Iterable<Seat>): Seat[] {
  return [...seats].filter((s) => s.status === "queue").sort(byQueue);
}

/** The pairs due now: the queue's first two on the first free court, the next two on the next, and so on. */
export function pairings(seats: Iterable<Seat>): Pair[] {
  const all = [...seats];
  const busy = new Set(all.filter((s) => s.status === "play").map((s) => s.court));
  const free = COURT_ORDER.filter((c) => !busy.has(c));
  const queue = queueOf(all);
  const out: Pair[] = [];
  for (let i = 0; i + 1 < queue.length && out.length < free.length; i += 2) {
    const court = free[out.length];
    const [host, guest] = [queue[i].id, queue[i + 1].id];
    out.push({ key: `${court}:${host}:${guest}:${queue[i].since.toString(36)}`, court, host, guest });
  }
  return out;
}

/**
 * Whether match `key` keeps its court. Two pairs can claim one court when their members saw the room a moment
 * apart: the match whose players queued first keeps it, and the other pair queues again (in its old place).
 */
export function ownsCourt(seats: Iterable<Seat>, key: string): boolean {
  const court = parseKey(key).court;
  let best: { key: string; since: number } | null = null;
  for (const s of seats) {
    if (s.status !== "play" || s.court !== court || !s.match) continue;
    if (!best || s.since < best.since || (s.since === best.since && s.match < best.key)) best = { key: s.match, since: s.since };
  }
  return !best || best.key === key;
}

export type LobbyView = {
  me: Seat;
  /** How many are ahead of me in the queue (0: I play next), or -1 when I am not in it. */
  ahead: number;
  waiting: number;
  /** Matches on now. */
  playing: number;
  seats: Seat[];
};

/** This phone's seat in the courts' room. */
export class Lobby {
  private readonly room: Room;
  private me: Seat;
  private seats = new Map<string, Seat>();
  private latest = new Map<string, Payload>();
  private view: LobbyView;
  private readonly listeners = new Set<() => void>();
  private readonly stopPresence: () => void;
  private resolving = false;
  private again = false;
  /** Matches this seat has played: another player still on a finished match's court must not pull it back in. */
  private readonly finished = new Set<string>();

  constructor(
    t: Transport,
    profile: { name: string; color: string },
    private readonly clock: () => number = Date.now,
  ) {
    this.room = t.join("lobby");
    this.me = { id: t.id, name: profile.name, color: profile.color, status: "idle", since: 0, want: null, court: null, match: null };
    this.seats.set(this.me.id, this.me);
    this.view = this.makeView();
    this.stopPresence = this.room.onPresence((all) => this.sync(all));
    this.room.track(this.me);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getView = () => this.view;

  /** Into the queue, at its end. */
  play() {
    if (this.me.status === "idle") this.set({ status: "queue", since: this.clock(), want: null });
  }

  /**
   * Back into the queue in the old place: a court lost to another pair, or (`drop`) a match whose other player
   * never came, which must not pull this seat back in.
   */
  requeue(drop = false) {
    if (drop && this.me.match) this.finished.add(this.me.match);
    this.set({ status: "queue", want: null, court: null, match: null });
  }

  /** Out of the queue, or off the court. */
  stop() {
    if (this.me.match) this.finished.add(this.me.match);
    this.set({ status: "idle", want: null, court: null, match: null });
  }

  /** Off the court after a match, and into the queue again at its end. */
  queueAgain() {
    this.stop();
    this.play();
  }

  close() {
    this.stopPresence();
    this.room.leave();
  }

  private set(change: Partial<Seat>) {
    this.me = { ...this.me, ...change };
    this.seats.set(this.me.id, this.me);
    this.room.track(this.me);
    this.resolveAll();
  }

  private sync(all: Map<string, Payload>) {
    this.latest = all;
    this.resolveAll();
  }

  /** Works out what to do from the room, again after each change of this seat, until nothing changes. */
  private resolveAll() {
    if (this.resolving) {
      this.again = true;
      return;
    }
    this.resolving = true;
    try {
      for (let i = 0; i < 10; i++) {
        this.again = false;
        this.resolve();
        if (!this.again) break;
      }
    } finally {
      this.resolving = false;
    }
    this.view = this.makeView();
    this.listeners.forEach((fn) => fn());
  }

  private resolve() {
    this.seats = new Map([...this.latest].map(([id, s]) => [id, s as unknown as Seat]));
    // this seat as it is now (the room may not have echoed the last change yet)
    this.seats.set(this.me.id, this.me);
    const me = this.me;
    if (me.status === "queue") {
      // a match with this seat in it has started: join it
      const started = [...this.seats.values()].find(
        (s) => s.id !== me.id && s.status === "play" && s.match && hasPlayer(s.match, me.id) && !this.finished.has(s.match),
      );
      if (started?.match) return this.set({ status: "play", court: parseKey(started.match).court, match: started.match, want: null });
      const pair = pairings(this.seats.values()).find((p) => p.host === me.id || p.guest === me.id) ?? null;
      if ((pair?.key ?? null) !== me.want) return this.set({ want: pair?.key ?? null });
      // both want it: it starts
      const other = pair && this.seats.get(pair.host === me.id ? pair.guest : pair.host);
      if (pair && other?.want === pair.key) this.set({ status: "play", court: pair.court, match: pair.key, want: null });
    } else if (me.status === "play" && me.match && !ownsCourt(this.seats.values(), me.match)) {
      this.requeue();
    }
  }

  private makeView(): LobbyView {
    const seats = [...this.seats.values()];
    const queue = queueOf(seats);
    return {
      me: this.me,
      ahead: queue.findIndex((s) => s.id === this.me.id),
      waiting: queue.length,
      playing: new Set(seats.filter((s) => s.status === "play").map((s) => s.match)).size,
      seats,
    };
  }
}

const hasPlayer = (key: string, id: string) => {
  const { host, guest } = parseKey(key);
  return host === id || guest === id;
};
