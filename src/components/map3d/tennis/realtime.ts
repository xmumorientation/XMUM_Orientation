import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { randomId, type Payload, type Transport } from "./net";

// DRAFT: the tennis game over Supabase Realtime (docs/ROADMAP.md, item 9, batch T2b): the same Transport as
// net.ts, with a Realtime channel per room. Broadcast carries the messages (never back to the sender) and Presence
// each member's state. Nothing is written to the database. Loaded only when the page asks for it (?net=realtime),
// so the game against the bot does not download it.

/** Messages kept while the channel is not joined (a send then would go over HTTP instead): the newest this many. */
const WAITING = 50;

export function realtimeTransport(client: SupabaseClient, id = randomId()): Transport {
  return {
    id,
    join(name) {
      const ch: RealtimeChannel = client.channel(`tennis:${name}`, {
        config: { broadcast: { self: false }, presence: { key: id } },
      });
      const handlers = new Map<string, Set<(p: Payload) => void>>();
      const watchers = new Set<(s: Map<string, Payload>) => void>();
      const waiting: { event: string; payload: Payload }[] = [];
      let joined = false;
      let mine: Payload | null = null;
      const states = () => {
        const all = new Map<string, Payload>();
        for (const [key, metas] of Object.entries(ch.presenceState())) {
          // a member on two connections has a state for each: the last is the newest
          const last = metas[metas.length - 1] as Payload | undefined;
          if (!last) continue;
          const state = { ...last };
          delete state.presence_ref;
          all.set(key, state);
        }
        return all;
      };
      ch.on("broadcast", { event: "*" }, (msg) => {
        handlers.get(msg.event)?.forEach((fn) => fn(msg.payload as Payload));
      });
      ch.on("presence", { event: "sync" }, () => {
        const all = states();
        watchers.forEach((fn) => fn(all));
      });
      // joined again after a dropped connection too: say this member's state again
      ch.subscribe((status) => {
        joined = status === "SUBSCRIBED";
        if (!joined) return;
        for (const m of waiting.splice(0)) void ch.send({ type: "broadcast", event: m.event, payload: m.payload });
        if (mine) void ch.track(mine);
      });
      return {
        send: (event, payload) => {
          if (joined) void ch.send({ type: "broadcast", event, payload });
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
          if (joined) void ch.track(state);
        },
        onPresence: (fn) => {
          watchers.add(fn);
          return () => {
            watchers.delete(fn);
          };
        },
        leave: () => {
          joined = false;
          void client.removeChannel(ch);
        },
      };
    },
  };
}
