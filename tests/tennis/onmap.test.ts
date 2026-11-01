import { describe, expect, it } from "vitest";

import type { Transport } from "../../src/components/map3d/tennis/net";
import { Online } from "../../src/components/map3d/tennis/online";
import { TennisOnMap } from "../../src/components/map3d/tennis/onMap";
import { Hub } from "./hub";

// The tennis game on the map pages (src/components/map3d/tennis/onMap.ts, batch T3b): one courts board for the page,
// on which the host also says its match (a phone may be in a room only once); the queue and back to the map; and
// Admin's Off, which leaves every room at once.

const DT = 1 / 60;

/** A transport that keeps the rooms its member joins, and says which it is in now. */
function tracked(t: Transport) {
  const joins: string[] = [];
  const open = new Map<string, number>();
  const transport: Transport = {
    id: t.id,
    join: (name) => {
      joins.push(name);
      open.set(name, (open.get(name) ?? 0) + 1);
      const room = t.join(name);
      return {
        ...room,
        leave: () => {
          open.set(name, open.get(name)! - 1);
          room.leave();
        },
      };
    },
  };
  const rooms = () => [...open].filter(([, n]) => n > 0).map(([name]) => name.split(":")[0]);
  return { transport, joins, rooms };
}

type Phone = ReturnType<typeof tracked> & { courts: TennisOnMap };

/** A phone with the map open. `local` "bot": a bot plays its matches (and rematches), so they run by themselves. */
function phone(hub: Hub, id: string, local: "bot" | "player", skew = 0): Phone {
  const t = tracked(hub.transport(id));
  const seat = (p: { name: string; color: string }) =>
    new Online(t.transport, p, local, () => hub.now + skew, false, () => hub.now * 1000);
  return { ...t, courts: new TennisOnMap(t.transport, seat) };
}

/** Runs the phones for `seconds`, or until `until` holds. */
function run(hub: Hub, phones: Phone[], seconds: number, until?: () => boolean) {
  const end = hub.now + seconds;
  while (hub.now < end) {
    hub.advance(hub.now + DT);
    for (const p of phones) {
      p.courts.online?.tick();
      p.courts.online?.link?.match.drain();
    }
    if (until?.()) return true;
  }
  return false;
}

const RED = { name: "Group 1", color: "#e11d48" };
const GREEN = { name: "Group 2", color: "#16a34a" };

describe("tennis on the map pages", () => {
  it("has one courts room per phone: the board everyone watches is the one the host says its match on", () => {
    const hub = new Hub(0.04);
    const [a, b] = [phone(hub, "a", "bot"), phone(hub, "b", "bot", 1.7)];
    const viewer = phone(hub, "v", "player");
    a.courts.play(RED);
    b.courts.play(GREEN);
    expect(run(hub, [a, b, viewer], 20, () => viewer.courts.board.getView().length > 0)).toBe(true);
    const key = a.courts.getView().match;
    expect(key).not.toBeNull();
    expect(b.courts.getView()).toMatchObject({ phase: "match", match: key });
    // the host's shirt first, then the other's, as the host's phone sees them
    const hostIsA = key!.split(":")[1] === "a";
    const shirts = hostIsA ? [RED.color, GREEN.color] : [GREEN.color, RED.color];
    expect(viewer.courts.board.getView()).toEqual([{ court: 1, key, colors: shirts }]);
    // the players' own boards show it too (their pages draw it as their match, not a spectator's)
    expect(a.courts.board.getView().map((c) => c.key)).toEqual([key]);
    for (const p of [a, b, viewer]) expect(p.joins.filter((r) => r === "courts")).toHaveLength(1);
  });

  it("queues on Play, and Cancel or Back to map leaves every room but the board", () => {
    const hub = new Hub(0.04);
    const [a, b] = [phone(hub, "a", "player"), phone(hub, "b", "player", 0.6)];
    a.courts.play(RED);
    run(hub, [a, b], 1);
    expect(a.courts.getView().phase).toBe("queue");
    expect(a.courts.getView().lobby?.waiting).toBe(1);
    a.courts.cancel();
    run(hub, [a, b], 0.5);
    expect(a.courts.getView().phase).toBe("idle");
    expect(a.rooms()).toEqual(["courts"]);
    // two players: a match (once it has started; one that never started puts the other back in the queue), then
    // both go back to the map
    a.courts.play(RED);
    b.courts.play(GREEN);
    expect(run(hub, [a, b], 20, () => a.courts.getView().phase === "match" && b.courts.getView().phase === "match")).toBe(true);
    expect(a.rooms().sort()).toEqual(["courts", "lobby", "match"]);
    const started = (p: Phone) => p.courts.online?.getView().match?.link.phase === "playing";
    expect(run(hub, [a, b], 20, () => started(a) && started(b))).toBe(true);
    a.courts.leave();
    run(hub, [a, b], 1);
    // the other player won (a left), and its end card stays until it goes back to the map too
    expect(b.courts.getView().phase).toBe("match");
    expect(b.courts.online?.link?.match.getView().left).toBe(1);
    b.courts.leave();
    run(hub, [a, b], 1);
    for (const p of [a, b]) {
      expect(p.courts.getView().phase).toBe("idle");
      expect(p.rooms()).toEqual(["courts"]);
      expect(p.courts.board.getView()).toEqual([]);
    }
  });

  it("closes at once when Admin turns the game off: the match ends, the queue empties, every room is left", () => {
    const hub = new Hub(0.04);
    const [a, b, c] = [phone(hub, "a", "bot"), phone(hub, "b", "bot", 2.3), phone(hub, "c", "player", 0.2)];
    const viewer = phone(hub, "v", "player");
    a.courts.play(RED);
    b.courts.play(GREEN);
    expect(run(hub, [a, b, c, viewer], 20, () => viewer.courts.board.getView().length > 0)).toBe(true);
    // a third player waits for someone
    c.courts.play(RED);
    run(hub, [a, b, c, viewer], 1);
    expect(c.courts.getView().phase).toBe("queue");
    // Off reaches every phone with the map open
    for (const p of [a, b, c, viewer]) p.courts.close();
    run(hub, [a, b, c, viewer], 1);
    for (const p of [a, b, c, viewer]) {
      expect(p.courts.getView().phase).toBe("idle");
      expect(p.rooms()).toEqual([]);
    }
    // nothing starts again on a closed page
    a.courts.play(RED);
    run(hub, [a], 1);
    expect(a.rooms()).toEqual([]);
  });

  it("plays a practice match against the bot: it takes a court on the board, and Leave frees it", () => {
    const hub = new Hub(0.04);
    const a = phone(hub, "a", "player");
    const viewer = phone(hub, "v", "player");
    expect(a.courts.playBot(RED)).toBe(true);
    expect(a.courts.getView().phase).toBe("match");
    expect(run(hub, [a, viewer], 1, () => viewer.courts.board.getView().length > 0)).toBe(true);
    const seen = viewer.courts.board.getView();
    // the bot's shirt differs from the player's own, as a real opponent's would
    expect(seen).toMatchObject([{ court: 1 }]);
    expect(seen[0].colors[0]).toBe(RED.color);
    expect(seen[0].colors[1]).not.toBe(RED.color);
    // Play (matchmaking) is blocked while the bot match is on, and so is a second Play with Bot
    a.courts.play(GREEN);
    expect(a.courts.getView().phase).toBe("match");
    expect(a.courts.playBot(GREEN)).toBe(false);
    a.courts.leave();
    expect(run(hub, [a, viewer], 1, () => viewer.courts.board.getView().length === 0)).toBe(true);
    expect(a.courts.getView().phase).toBe("idle");
  });

  it("refuses Play with Bot once all three courts are taken", () => {
    const hub = new Hub(0.04);
    const phones = ["a", "b", "c"].map((id, i) => phone(hub, id, "player", i * 0.2));
    // each phone's own board must have heard of the last one's match before it looks for a free court itself
    for (const p of phones) {
      expect(p.courts.playBot(RED)).toBe(true);
      run(hub, phones, 1);
    }
    expect(phones[0].courts.board.getView()).toHaveLength(3);
    const fourth = phone(hub, "d", "player", 0.9);
    run(hub, [...phones, fourth], 1);
    expect(fourth.courts.board.getView()).toHaveLength(3);
    expect(fourth.courts.playBot(GREEN)).toBe(false);
    expect(fourth.courts.getView().phase).toBe("idle");
  });

  it("frees the court for everyone else when the players' phones close", () => {
    const hub = new Hub(0.04);
    const [a, b] = [phone(hub, "a", "bot"), phone(hub, "b", "bot", 0.9)];
    const viewer = phone(hub, "v", "player");
    a.courts.play(RED);
    b.courts.play(GREEN);
    expect(run(hub, [a, b, viewer], 20, () => viewer.courts.board.getView().length > 0)).toBe(true);
    a.courts.close();
    b.courts.close();
    expect(run(hub, [viewer], 2, () => viewer.courts.board.getView().length === 0)).toBe(true);
  });
});
