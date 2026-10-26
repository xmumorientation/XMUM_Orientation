// DRAFT: the tennis game's network (docs/ROADMAP.md, item 9, batch T2a): rooms with messages and presence, behind
// one interface. T2a runs it over the browser's BroadcastChannel, between tabs of one browser on one device. T2b
// swaps in Supabase Realtime, which has the same shape: a channel per room, Broadcast for the messages (`self:
// false`) and Presence for each member's state. Nothing else in the game talks to the network.

export type Payload = Record<string, unknown>;

/** A room: messages to everyone else in it, and presence (each member's state, kept while they are in it). */
export interface Room {
  /** Sends to every other member (never back to this one). */
  send(event: string, payload: Payload): void;
  /** Calls `fn` with each message of this event from another member. Returns a function that stops it. */
  on(event: string, fn: (payload: Payload) => void): () => void;
  /** Sets this member's presence state (it replaces the last). */
  track(state: Payload): void;
  /** Calls `fn` with every member's state, this one's included, whenever one changes. */
  onPresence(fn: (states: Map<string, Payload>) => void): () => void;
  leave(): void;
}

export interface Transport {
  /** This member's id, the same in every room: a random one per tab (a player is a phone, not an account). */
  readonly id: string;
  join(room: string): Room;
}

/** A random id. Not crypto.randomUUID: a phone on the dev server's network address is not a secure context. */
export const randomId = () => Math.random().toString(36).slice(2, 10);

/** Presence over BroadcastChannel: each member repeats its state every PULSE_MS, and is gone after LOST_MS of silence. */
const PULSE_MS = 1000;
const LOST_MS = 3500;

type Wire =
  | { kind: "msg"; from: string; event: string; payload: Payload }
  /** A member's state; null when it leaves. */
  | { kind: "state"; from: string; state: Payload | null }
  /** A member joined: everyone repeats their state now, so it learns them at once. */
  | { kind: "hello"; from: string };

/** The transport between tabs of this browser (T2a). */
export function tabTransport(id = randomId()): Transport {
  return {
    id,
    join(name) {
      const bc = new BroadcastChannel(`tennis:${name}`);
      const handlers = new Map<string, Set<(p: Payload) => void>>();
      const watchers = new Set<(s: Map<string, Payload>) => void>();
      const others = new Map<string, { state: Payload; seen: number; text: string }>();
      let mine: Payload | null = null;
      const post = (w: Wire) => bc.postMessage(w);
      const changed = () => {
        const all = new Map<string, Payload>();
        for (const [k, v] of others) all.set(k, v.state);
        if (mine) all.set(id, mine);
        watchers.forEach((fn) => fn(all));
      };
      bc.onmessage = (e: MessageEvent<Wire>) => {
        const w = e.data;
        if (w.kind === "msg") handlers.get(w.event)?.forEach((fn) => fn(w.payload));
        else if (w.kind === "hello") {
          if (mine) post({ kind: "state", from: id, state: mine });
        } else if (w.state) {
          const text = JSON.stringify(w.state);
          const had = others.get(w.from);
          others.set(w.from, { state: w.state, seen: Date.now(), text });
          if (had?.text !== text) changed();
        } else if (others.delete(w.from)) changed();
      };
      const pulse = setInterval(() => {
        if (mine) post({ kind: "state", from: id, state: mine });
        const now = Date.now();
        let lost = false;
        for (const [k, v] of others) {
          if (now - v.seen > LOST_MS) {
            others.delete(k);
            lost = true;
          }
        }
        if (lost) changed();
      }, PULSE_MS);
      post({ kind: "hello", from: id });
      return {
        send: (event, payload) => post({ kind: "msg", from: id, event, payload }),
        on: (event, fn) => {
          let set = handlers.get(event);
          if (!set) handlers.set(event, (set = new Set()));
          set.add(fn);
          return () => {
            set.delete(fn);
          };
        },
        track: (state) => {
          mine = state;
          post({ kind: "state", from: id, state });
          changed();
        },
        onPresence: (fn) => {
          watchers.add(fn);
          return () => {
            watchers.delete(fn);
          };
        },
        leave: () => {
          clearInterval(pulse);
          if (mine) post({ kind: "state", from: id, state: null });
          bc.close();
        },
      };
    },
  };
}
