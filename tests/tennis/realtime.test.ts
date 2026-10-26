import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { Payload } from "../../src/components/map3d/tennis/net";
import { realtimeTransport } from "../../src/components/map3d/tennis/realtime";

// The tennis game's Supabase Realtime transport (src/components/map3d/tennis/realtime.ts), on a stand-in for the
// Realtime channel: it records what the transport calls, and plays the server's part by hand (join, deliver, sync).

type Listener = { type: string; event: string; fn: (m: { event: string; payload: unknown }) => void };

class FakeChannel {
  removed = false;
  sent: { event: string; payload: unknown }[] = [];
  tracked: unknown[] = [];
  state: Record<string, Payload[]> = {};
  private listeners: Listener[] = [];
  private status: ((s: string) => void) | null = null;

  constructor(
    readonly topic: string,
    readonly opts: unknown,
  ) {}

  on(type: string, filter: { event: string }, fn: Listener["fn"]) {
    this.listeners.push({ type, event: filter.event, fn });
    return this;
  }

  subscribe(cb: (s: string) => void) {
    this.status = cb;
    return this;
  }

  send(m: { type: string; event: string; payload: unknown }) {
    this.sent.push({ event: m.event, payload: m.payload });
    return Promise.resolve("ok");
  }

  track(s: unknown) {
    this.tracked.push(s);
    return Promise.resolve("ok");
  }

  presenceState() {
    return this.state;
  }

  // the server's part
  join(status = "SUBSCRIBED") {
    this.status?.(status);
  }

  deliver(event: string, payload: unknown) {
    for (const l of this.listeners) if (l.type === "broadcast" && (l.event === "*" || l.event === event)) l.fn({ event, payload });
  }

  sync() {
    for (const l of this.listeners) if (l.type === "presence" && l.event === "sync") l.fn({ event: "sync", payload: {} });
  }
}

function fake() {
  const channels: FakeChannel[] = [];
  const client = {
    channel: (topic: string, opts: unknown) => {
      const c = new FakeChannel(topic, opts);
      channels.push(c);
      return c;
    },
    removeChannel: (c: FakeChannel) => {
      c.removed = true;
      return Promise.resolve("ok");
    },
  };
  return { transport: realtimeTransport(client as unknown as SupabaseClient, "me"), channels };
}

describe("tennis over Supabase Realtime", () => {
  it("opens a channel per room: messages to the others only, presence under this member's id", () => {
    const { transport, channels } = fake();
    transport.join("lobby");
    expect(channels[0].topic).toBe("tennis:lobby");
    expect(channels[0].opts).toEqual({ config: { broadcast: { self: false }, presence: { key: "me" } } });
  });

  it("holds messages and presence until the channel has joined (a send before that would go over HTTP)", () => {
    const { transport, channels } = fake();
    const room = transport.join("match:1:a:b:x");
    const ch = channels[0];
    room.send("pos", { x: 1 });
    room.track({ status: "queue" });
    expect(ch.sent).toEqual([]);
    expect(ch.tracked).toEqual([]);
    ch.join();
    expect(ch.sent).toEqual([{ event: "pos", payload: { x: 1 } }]);
    expect(ch.tracked).toEqual([{ status: "queue" }]);
    room.send("note", { type: "cancel" });
    expect(ch.sent).toHaveLength(2);
    // a dropped connection: hold again, and say the state again on joining again
    ch.join("CHANNEL_ERROR");
    room.send("pos", { x: 2 });
    expect(ch.sent).toHaveLength(2);
    ch.join();
    expect(ch.sent).toHaveLength(3);
    expect(ch.tracked).toHaveLength(2);
  });

  it("passes messages on by event, and presence as each member's newest state", () => {
    const { transport, channels } = fake();
    const room = transport.join("lobby");
    const ch = channels[0];
    const got: Payload[] = [];
    let states = new Map<string, Payload>();
    room.on("hi", (p) => got.push(p));
    room.onPresence((s) => (states = s));
    ch.deliver("hi", { n: 1 });
    ch.deliver("pos", { n: 2 });
    expect(got).toEqual([{ n: 1 }]);
    ch.state = {
      me: [{ presence_ref: "r1", status: "queue" }],
      them: [
        { presence_ref: "r2", status: "idle" },
        { presence_ref: "r3", status: "play" },
      ],
    };
    ch.sync();
    expect(states).toEqual(
      new Map([
        ["me", { status: "queue" }],
        ["them", { status: "play" }],
      ]),
    );
  });

  it("leaves a room by removing its channel", () => {
    const { transport, channels } = fake();
    transport.join("lobby").leave();
    expect(channels[0].removed).toBe(true);
  });
});
