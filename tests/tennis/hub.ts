import type { Payload, Room, Transport } from "../../src/components/map3d/tennis/net";

// An in-memory network for the tennis game's tests: rooms with messages and presence (as net.ts), each delivered
// `delay` seconds after it was sent on a test clock that the test moves on. A member can be cut off: it then sends
// and hears nothing, as a phone that lost its connection or a hidden tab.

type Member = {
  id: string;
  handlers: Map<string, Set<(p: Payload) => void>>;
  watchers: Set<(s: Map<string, Payload>) => void>;
  state: Payload | null;
};

export class Hub {
  now = 0;
  readonly cut = new Set<string>();
  /** Messages sent, by event (the load a real network would carry). */
  readonly sent = new Map<string, number>();
  private queue: { at: number; n: number; run: () => void }[] = [];
  private count = 0;
  private readonly rooms = new Map<string, Set<Member>>();

  constructor(private readonly delay = 0.04) {}

  transport(id: string): Transport {
    return { id, join: (name) => this.join(id, name) };
  }

  /** A member gone without a word (its tab closed): cut off, and out of every room's presence. */
  drop(id: string) {
    this.cut.add(id);
    for (const members of this.rooms.values()) {
      for (const m of members) {
        if (m.id !== id) continue;
        members.delete(m);
        for (const o of members) this.later(() => !this.cut.has(o.id) && o.watchers.forEach((fn) => fn(this.statesOf(members))));
      }
    }
  }

  private statesOf(members: Set<Member>) {
    const all = new Map<string, Payload>();
    for (const m of members) if (m.state) all.set(m.id, structuredClone(m.state));
    return all;
  }

  /** Moves the test clock on to t, delivering everything due by then (in the order sent). */
  advance(t: number) {
    this.now = t;
    for (;;) {
      this.queue.sort((a, b) => a.at - b.at || a.n - b.n);
      const next = this.queue[0];
      if (!next || next.at > t) return;
      this.queue.shift();
      next.run();
    }
  }

  private later(run: () => void) {
    this.queue.push({ at: this.now + this.delay, n: this.count++, run });
  }

  private join(id: string, name: string): Room {
    let room = this.rooms.get(name);
    if (!room) this.rooms.set(name, (room = new Set()));
    const members = room;
    const me: Member = { id, handlers: new Map(), watchers: new Set(), state: null };
    members.add(me);
    const states = () => this.statesOf(members);
    const presence = () => {
      for (const m of members) this.later(() => !this.cut.has(m.id) && m.watchers.forEach((fn) => fn(states())));
    };
    return {
      send: (event, payload) => {
        if (this.cut.has(id)) return;
        this.sent.set(event, (this.sent.get(event) ?? 0) + 1);
        const copy = structuredClone(payload);
        for (const m of members) {
          if (m !== me) this.later(() => !this.cut.has(m.id) && m.handlers.get(event)?.forEach((fn) => fn(structuredClone(copy))));
        }
      },
      on: (event, fn) => {
        let set = me.handlers.get(event);
        if (!set) me.handlers.set(event, (set = new Set()));
        set.add(fn);
        return () => {
          set.delete(fn);
        };
      },
      track: (state) => {
        me.state = structuredClone(state);
        presence();
      },
      onPresence: (fn) => {
        me.watchers.add(fn);
        this.later(() => fn(states()));
        return () => {
          me.watchers.delete(fn);
        };
      },
      leave: () => {
        members.delete(me);
        presence();
      },
    };
  }
}
