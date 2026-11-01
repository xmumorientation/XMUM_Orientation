import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { randomId, type Payload, type Transport } from "./net";

// DRAFT: the tennis game over Supabase Realtime (docs/ROADMAP.md, item 9, batch T2b): the same Transport as
// net.ts, with a Realtime channel per room. Broadcast carries the messages (never back to the sender) and Presence
// each member's state. Nothing is written to the database. Loaded only when the page asks for it (?net=realtime,
// and the map pages while the game is open), so the game against the bot does not download it.

/** Messages kept while the channel is not joined (a send then would go over HTTP instead): the newest this many. */
const WAITING = 50;

export function realtimeTransport(client: SupabaseClient, id = randomId()): Transport {
  /**
   * Rooms left a moment ago, by channel name, until their channel has gone. supabase-js keeps a channel until the
   * server says it has left, and channel() hands that one back for the same name, to be removed under the room
   * that took it (Play again, or Cancel and Play: the queue's room is left and joined at once).
   */
  const leaving = new Map<string, Promise<unknown>>();
  return {
    id,
    join(name) {
      const topic = `tennis:${name}`;
      const handlers = new Map<string, Set<(p: Payload) => void>>();
      const watchers = new Set<(s: Map<string, Payload>) => void>();
      const waiting: { event: string; payload: Payload }[] = [];
      let ch: RealtimeChannel | null = null;
      let joined = false;
      let left = false;
      let mine: Payload | null = null;
      const states = () => {
        const all = new Map<string, Payload>();
        for (const [key, metas] of Object.entries(ch?.presenceState() ?? {})) {
          // a member on two connections has a state for each: the last is the newest
          const last = metas[metas.length - 1] as Payload | undefined;
          if (!last) continue;
          const state = { ...last };
          delete state.presence_ref;
          all.set(key, state);
        }
        return all;
      };
      const open = () => {
        if (left) return;
        const c = (ch = client.channel(topic, { config: { broadcast: { self: false }, presence: { key: id } } }));
        c.on("broadcast", { event: "*" }, (msg) => {
          handlers.get(msg.event)?.forEach((fn) => fn(msg.payload as Payload));
        });
        c.on("presence", { event: "sync" }, () => {
          const all = states();
          watchers.forEach((fn) => fn(all));
        });
        // joined again after a dropped connection too: say this member's state again
        c.subscribe((status) => {
          joined = status === "SUBSCRIBED";
          if (!joined) return;
          for (const m of waiting.splice(0)) void c.send({ type: "broadcast", event: m.event, payload: m.payload });
          if (mine) void c.track(mine);
        });
      };
      const before = leaving.get(topic);
      if (before) void before.then(open, open);
      else open();
      return {
        send: (event, payload) => {
          if (joined && ch) void ch.send({ type: "broadcast", event, payload });
          else {
            waiting.push({ event, payload });
            if (waiting.length > WAITING) waiting.shift();
          }
        },
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
          if (joined && ch) void ch.track(state);
        },
        untrack: () => {
          mine = null;
          if (joined && ch) void ch.untrack();
        },
        onPresence: (fn) => {
          watchers.add(fn);
          return () => {
            watchers.delete(fn);
          };
        },
        leave: () => {
          left = true;
          joined = false;
          if (!ch) return;
          const gone = client.removeChannel(ch);
          leaving.set(topic, gone);
          void gone.finally(() => {
            if (leaving.get(topic) === gone) leaving.delete(topic);
          });
        },
      };
    },
  };
}
