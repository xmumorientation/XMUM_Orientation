import { describe, expect, it } from "vitest";

import { ownsCourt, pairings, type Seat } from "../../src/components/map3d/tennis/lobby";
import type { Fx, MatchView, Who } from "../../src/components/map3d/tennis/match";
import { Online } from "../../src/components/map3d/tennis/online";
import { Hub } from "./hub";

// The tennis game between two phones (src/components/map3d/tennis/lobby.ts, link.ts, online.ts) over a test
// network with latency, on clocks that disagree: the queue and its pairs, whole matches between two bots (the same
// score on both phones, every shot on the same path), a phone that goes quiet, and rematches.

const DT = 1 / 60;

const seat = (id: string, since: number, more: Partial<Seat> = {}): Seat => ({
  id,
  name: id,
  color: "#008cff",
  status: "queue",
  since,
  want: null,
  court: null,
  match: null,
  ...more,
});

type Phone = { id: string; online: Online; off: boolean; fx: Fx[]; over: MatchView | null };

/** Phones on the hub, each with its own clock (`skews`, seconds off the hub's); the queue goes by the hub's. */
function phones(hub: Hub, who: Who, ids: string[], skews: number[] = []): Phone[] {
  return ids.map((id, i) => ({
    id,
    online: new Online(hub.transport(id), { name: id, color: "#008cff" }, who, () => hub.now + (skews[i] ?? 0), false, () => hub.now * 1000),
    off: false,
    fx: [],
    over: null,
  }));
}

/** Runs the phones for `seconds`, or until `until` holds; true if it did. Keeps each one's events and first result. */
function run(hub: Hub, list: Phone[], seconds: number, until?: () => boolean) {
  const end = hub.now + seconds;
  while (hub.now < end) {
    hub.advance(hub.now + DT);
    for (const p of list) {
      if (p.off) continue;
      p.online.tick();
      const m = p.online.link?.match;
      if (!m) continue;
      p.fx.push(...m.drain());
      if (!p.over && m.getView().phase === "over") p.over = m.getView();
    }
    if (until?.()) return true;
  }
  return false;
}

const phaseOf = (p: Phone) => p.online.getView().match?.link.phase ?? null;

describe("tennis queue", () => {
  it("pairs the queue in order, the middle court first, at most three matches at once", () => {
    const seats = ["a", "b", "c", "d", "e", "f", "g"].map((id, i) => seat(id, 100 + i));
    expect(pairings(seats).map((p) => [p.court, p.host, p.guest])).toEqual([
      [1, "a", "b"],
      [0, "c", "d"],
      [2, "e", "f"],
    ]);
    const playing = { status: "play" as const, court: 1, match: "1:x:y:1" };
    const busy = [seat("x", 1, playing), seat("y", 2, playing), ...seats.slice(0, 4)];
    expect(pairings(busy).map((p) => p.court)).toEqual([0, 2]);
  });

  it("gives a court two pairs claim to the pair that queued first", () => {
    const late = { status: "play" as const, court: 1, match: "1:a:b:5" };
    const early = { status: "play" as const, court: 1, match: "1:c:d:3" };
    const seats = [seat("a", 5, late), seat("b", 6, late), seat("c", 3, early), seat("d", 4, early)];
    expect(ownsCourt(seats, "1:c:d:3")).toBe(true);
    expect(ownsCourt(seats, "1:a:b:5")).toBe(false);
  });

  it("puts phones that queue on the courts in pairs; the fifth waits", () => {
    const hub = new Hub();
    const list = phones(hub, "player", ["a", "b", "c", "d", "e"]);
    for (const p of list) {
      p.online.play();
      run(hub, list, 0.05);
    }
    run(hub, list, 1);
    expect(list.map((p) => p.online.getView().match?.court ?? null)).toEqual([1, 1, 0, 0, null]);
    expect(list[4].online.getView().lobby).toMatchObject({ ahead: 0, waiting: 1, playing: 2 });
  });
});

describe("tennis between two phones", () => {
  it("plays a whole match between two bots: the same score on both phones, every shot on the same path", () => {
    const hub = new Hub(0.04);
    const [a, b] = phones(hub, "bot", ["a", "b"], [0, 3.7]);
    expect(run(hub, [a, b], 600, () => a.over !== null && b.over !== null)).toBe(true);
    const [va, vb] = [a.over!, b.over!];
    expect(Math.max(...va.score)).toBe(5);
    expect(va.score).toEqual([vb.score[1], vb.score[0]]);
    expect(va.winner).toBe(vb.winner === 0 ? 1 : 0);
    // each phone's own hits, as the other phone drew them: the same ball at the same moment, turned round
    for (const [x, y] of [
      [a, b],
      [b, a],
    ]) {
      const mine = x.fx.filter((e) => e.type === "hit" && e.by === 0);
      const theirs = y.fx.filter((e) => e.type === "hit" && e.by === 1);
      expect(mine.length).toBeGreaterThan(10);
      expect(theirs.length).toBe(mine.length);
      mine.forEach((e, i) => {
        expect(theirs[i].t).toBeCloseTo(e.t, 9);
        expect(theirs[i].p[0]).toBeCloseTo(-e.p[0], 9);
        expect(theirs[i].p[2]).toBeCloseTo(-e.p[2], 9);
      });
    }
  });

  it("keeps the messages few: positions at most 8 a second per phone", () => {
    const hub = new Hub();
    const [a, b] = phones(hub, "bot", ["a", "b"]);
    run(hub, [a, b], 30, () => phaseOf(a) === "playing" && phaseOf(b) === "playing");
    const [start, pos] = [hub.now, hub.sent.get("pos") ?? 0];
    run(hub, [a, b], 60);
    const perPhone = ((hub.sent.get("pos") ?? 0) - pos) / (hub.now - start) / 2;
    expect(perPhone).toBeLessThanOrEqual(8.1);
    expect(perPhone).toBeGreaterThan(1);
  });

  it("pauses when a phone goes quiet for 4 s, and it loses 10 s later; when it comes back, it hears so", () => {
    const hub = new Hub();
    const [a, b] = phones(hub, "bot", ["a", "b"], [0, -2.5]);
    run(hub, [a, b], 30, () => phaseOf(a) === "playing" && phaseOf(b) === "playing");
    run(hub, [a, b], 3);
    b.off = true;
    hub.cut.add("b");
    run(hub, [a, b], 3);
    expect(phaseOf(a)).toBe("playing");
    run(hub, [a, b], 1.5);
    expect(phaseOf(a)).toBe("paused");
    run(hub, [a, b], 10);
    expect(phaseOf(a)).toBe("over");
    expect(a.online.link!.match.getView()).toMatchObject({ left: 1, winner: 0 });
    b.off = false;
    hub.cut.delete("b");
    run(hub, [a, b], 4);
    expect(b.online.link!.match.getView()).toMatchObject({ left: 0, winner: 1 });
  });

  it("plays the point again when the quiet phone comes back in time, and the match goes on to the end", () => {
    const hub = new Hub();
    const [a, b] = phones(hub, "bot", ["a", "b"], [1.2, 0]);
    run(hub, [a, b], 30, () => phaseOf(a) === "playing" && phaseOf(b) === "playing");
    run(hub, [a, b], 8);
    const score = [...a.online.link!.match.getView().score];
    b.off = true;
    hub.cut.add("b");
    run(hub, [a, b], 4);
    expect(phaseOf(a)).toBe("paused");
    b.off = false;
    hub.cut.delete("b");
    // both count down to the same point again, the score as it was
    expect(run(hub, [a, b], 2, () => phaseOf(a) === "countdown" && phaseOf(b) === "countdown")).toBe(true);
    expect(a.online.link!.match.getView().score).toEqual(score);
    expect(b.online.link!.match.getView().score).toEqual([score[1], score[0]]);
    expect(run(hub, [a, b], 4, () => phaseOf(a) === "playing" && phaseOf(b) === "playing")).toBe(true);
    expect(run(hub, [a, b], 600, () => a.over !== null && b.over !== null)).toBe(true);
    expect(a.over!.score).toEqual([b.over!.score[1], b.over!.score[0]]);
    expect(a.over!.left).toBeNull();
  });

  it("agrees on the result even when messages are lost: either phone cut off for 1 to 9 s, at different latencies", () => {
    for (let k = 0; k < 30; k++) {
      const hub = new Hub((k % 4) * 0.04);
      hub.now = k * 1.37;
      const list = phones(hub, "bot", ["a", "b"], [((k * 3) % 5) - 2, ((k * 7) % 3) - 1]);
      // what each player sees: their match's first end, kept as it happens (the next round may start at once)
      const ends: (number[] | null)[] = [null, null];
      const seen = new Set<object>();
      const watch = () =>
        list.forEach((p, i) => {
          const link = p.online.link;
          if (!link || seen.has(link)) return;
          seen.add(link);
          link.subscribe(() => {
            if (!ends[i] && link.getView().phase === "over") ends[i] = [...link.match.getView().score];
          });
        });
      const step = (seconds: number, until?: () => boolean) =>
        run(hub, list, seconds, () => {
          watch();
          return until?.() ?? false;
        });
      step(30, () => phaseOf(list[0]) === "playing" && phaseOf(list[1]) === "playing");
      step(4 + (k % 7) * 1.3);
      const quiet = list[k % 2];
      quiet.off = true;
      hub.cut.add(quiet.id);
      step(1 + (k % 9));
      quiet.off = false;
      hub.cut.delete(quiet.id);
      expect(step(900, () => ends[0] !== null && ends[1] !== null)).toBe(true);
      expect(ends[0]).toEqual([ends[1]![1], ends[1]![0]]);
    }
  });

  it("starts a second round when both want a rematch", () => {
    const hub = new Hub();
    const [a, b] = phones(hub, "bot", ["a", "b"]);
    run(hub, [a, b], 600, () => a.over !== null && b.over !== null);
    expect(run(hub, [a, b], 10, () => a.online.getView().match?.link.round === 2 && b.online.getView().match?.link.round === 2)).toBe(true);
  });

  it("closes the match when one says no, and both are off the court; players who never swing still finish", () => {
    const hub = new Hub();
    const [a, b] = phones(hub, "player", ["a", "b"]);
    a.online.play();
    run(hub, [a, b], 0.1);
    b.online.play();
    // nobody taps: each serve goes by itself, and each point is the server's
    expect(run(hub, [a, b], 300, () => a.over !== null && b.over !== null)).toBe(true);
    expect(a.over!.score).toEqual([b.over!.score[1], b.over!.score[0]]);
    a.online.rematch(false);
    run(hub, [a, b], 1);
    expect(phaseOf(a)).toBe("closed");
    expect(phaseOf(b)).toBe("closed");
    expect(a.online.getView().match?.link.closed).toBe("declined");
    expect([a, b].map((p) => p.online.getView().lobby.me.status)).toEqual(["idle", "idle"]);
    // and back into the queue: they meet again on a new match
    a.online.playAgain();
    run(hub, [a, b], 0.1);
    b.online.playAgain();
    run(hub, [a, b], 2);
    expect(a.online.getView().match?.link.phase).not.toBe("closed");
    expect(a.online.getView().match?.key).toBe(b.online.getView().match?.key);
  });
});
