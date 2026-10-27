import { describe, expect, it } from "vitest";

import { Board, hostOnBoard } from "../../src/components/map3d/tennis/board";
import { parseKey } from "../../src/components/map3d/tennis/lobby";
import type { Fx, MatchView } from "../../src/components/map3d/tennis/match";
import type { Transport } from "../../src/components/map3d/tennis/net";
import { Online } from "../../src/components/map3d/tennis/online";
import { Watch, WATCH_MAX } from "../../src/components/map3d/tennis/watch";
import { Hub } from "./hub";

// Watching the tennis courts (src/components/map3d/tennis/board.ts, watch.ts): the busy courts on the board from
// a match's countdown until it closes, a watcher who joins mid-match and replays it (every shot on the players'
// path, the same score) while sending nothing, and the watchers a match takes.

const DT = 1 / 60;

type Phone = { id: string; online: Online; fx: Fx[]; over: MatchView | null };

function bots(hub: Hub, ids: string[], skews: number[]): Phone[] {
  return ids.map((id, i) => ({
    id,
    online: new Online(hub.transport(id), { name: id, color: "#008cff" }, "bot", () => hub.now + skews[i], false, () => hub.now * 1000),
    fx: [],
    over: null,
  }));
}

type Watcher = { watch: Watch; fx: Fx[]; readyAt: number | null };

/** Runs the phones and the watchers for `seconds`, or until `until` holds. */
function run(hub: Hub, phones: Phone[], watchers: Watcher[], seconds: number, until?: () => boolean) {
  const end = hub.now + seconds;
  while (hub.now < end) {
    hub.advance(hub.now + DT);
    for (const p of phones) {
      p.online.tick();
      const m = p.online.link?.match;
      if (!m) continue;
      p.fx.push(...m.drain());
      if (!p.over && m.getView().phase === "over") p.over = m.getView();
    }
    for (const w of watchers) {
      const t = w.watch.time();
      if (t === null) continue;
      w.watch.advance(t);
      if (w.watch.ready) w.readyAt ??= t;
      w.fx.push(...w.watch.match.drain());
    }
    if (until?.()) return true;
  }
  return false;
}

/** A transport that counts what its member sends. */
function counted(t: Transport) {
  const sent: string[] = [];
  const transport: Transport = {
    id: t.id,
    join: (name) => {
      const room = t.join(name);
      return { ...room, send: (event, payload) => (sent.push(event), room.send(event, payload)) };
    },
  };
  return { transport, sent };
}

const playing = (p: Phone) => p.online.getView().match?.link.phase === "playing";

describe("tennis courts board", () => {
  it("shows a hosted match from its countdown until it closes, in both players' shirts", () => {
    const hub = new Hub(0.04);
    const [a, b] = bots(hub, ["a", "b"], [0, 2.1]);
    for (const p of [a, b]) hostOnBoard(p.online, hub.transport(p.id), (theirs) => [`#00000${p.id === "a" ? 1 : 2}`, theirs]);
    const board = new Board(hub.transport("v"));
    run(hub, [a, b], [], 10, () => board.getView().length > 0);
    const key = a.online.getView().match!.key;
    const host = parseKey(key).host;
    expect(board.getView()).toEqual([{ court: 1, key, colors: [host === "a" ? "#000001" : "#000002", "#008cff"] }]);
    // the view keeps its array while nothing changes
    const view = board.getView();
    run(hub, [a, b], [], 2);
    expect(board.getView()).toBe(view);
    // the host leaves: the court is free
    (host === "a" ? a : b).online.leave();
    run(hub, [a, b], [], 0.5);
    expect(board.getView()).toEqual([]);
  });

  it("ignores a presence that is not a court", () => {
    const hub = new Hub(0.04);
    const board = new Board(hub.transport("v"));
    const bad = hub.transport("x").join("courts");
    bad.track({ court: 1, key: "1:a:b:c", colors: ["#fff", "#000000"] });
    const odd = hub.transport("y").join("courts");
    odd.track({ court: 2, key: "1:a:b:c", colors: ["#ffffff", "#000000"] });
    hub.advance(1);
    expect(board.getView()).toEqual([]);
  });
});

describe("watching a match", () => {
  it("joins mid-match and replays it: every shot on the players' path, the same score, sending nothing", () => {
    const hub = new Hub(0.05);
    const [a, b] = bots(hub, ["a", "b"], [0, 3.7]);
    expect(run(hub, [a, b], [], 20, () => playing(a) && playing(b))).toBe(true);
    run(hub, [a, b], [], 6);
    const key = a.online.getView().match!.key;
    const host = parseKey(key).host === "a" ? a : b;
    const spy = counted(hub.transport("w"));
    const w: Watcher = { watch: new Watch(spy.transport, key, () => hub.now - 5.2, () => hub.now * 1000), fx: [], readyAt: null };
    expect(run(hub, [a, b], [w], 600, () => host.over !== null)).toBe(true);
    // the watcher is drawn a little behind the players (and the bots rematch at once, so it may not see the end)
    const final = host.over!.score;
    const same = () => w.watch.match.score.join() === final.join();
    expect(same() || run(hub, [a, b], [w], 1, same)).toBe(true);
    expect(w.watch.status).toBe("watching");
    expect(spy.sent).toEqual([]);
    // every hit after the watcher had its score, as the host drew it
    const hits = (fx: Fx[], from: number) => fx.filter((e) => e.type === "hit" && e.t > from) as Extract<Fx, { type: "hit" }>[];
    const from = w.readyAt! + 0.5;
    const theirs = hits(host.fx, from);
    const mine = hits(w.fx, from);
    expect(theirs.length).toBeGreaterThan(4);
    expect(mine.length).toBe(theirs.length);
    mine.forEach((e, i) => {
      expect(e.by).toBe(theirs[i].by);
      expect(e.t).toBeCloseTo(theirs[i].t, 6);
      e.p.forEach((c, k) => expect(c).toBeCloseTo(theirs[i].p[k], 6));
    });
  });

  it("follows a rematch from 0–0", () => {
    const hub = new Hub(0.05);
    const [a, b] = bots(hub, ["a", "b"], [0, 1.3]);
    expect(run(hub, [a, b], [], 20, () => playing(a) && playing(b))).toBe(true);
    const key = a.online.getView().match!.key;
    const host = parseKey(key).host === "a" ? a : b;
    const w: Watcher = { watch: new Watch(hub.transport("w"), key, () => hub.now + 9, () => hub.now * 1000), fx: [], readyAt: null };
    expect(run(hub, [a, b], [w], 600, () => host.over !== null)).toBe(true);
    // the bots rematch: the next round starts, and the watcher with it
    expect(run(hub, [a, b], [w], 60, () => host.online.getView().match!.link.round === 2 && playing(host))).toBe(true);
    run(hub, [a, b], [w], 1);
    const v = w.watch.match.getView();
    expect(v.phase).not.toBe("over");
    expect(Math.max(...v.score)).toBeLessThan(2);
    expect(v.score).toEqual(host.online.link!.match.getView().score);
  });

  it(`lets in the first ${WATCH_MAX} watchers; the rest leave`, () => {
    const hub = new Hub(0.05);
    const [a, b] = bots(hub, ["a", "b"], [0, 0.4]);
    expect(run(hub, [a, b], [], 20, () => playing(a) && playing(b))).toBe(true);
    const key = a.online.getView().match!.key;
    const watchers: Watcher[] = [];
    for (let i = 0; i < WATCH_MAX + 2; i++) {
      watchers.push({ watch: new Watch(hub.transport(`w${i}`), key, () => hub.now, () => hub.now * 1000), fx: [], readyAt: null });
      run(hub, [a, b], watchers, 0.02);
    }
    run(hub, [a, b], watchers, 1);
    expect(watchers.map((w) => w.watch.status)).toEqual([...Array(WATCH_MAX).fill("watching"), "full", "full"]);
    // the players play on
    expect(playing(a) && playing(b)).toBe(true);
  });
});
