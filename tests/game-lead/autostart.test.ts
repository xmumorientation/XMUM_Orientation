// 0101 fn_game_autostart on the live database's fn_phase_control (bonding-
// session 0036): a day's game starts itself at its schedule item's planned
// start, runs to the item's end, and leaves alone a game that is running, was
// ended by Admin after the planned start, or would clash with the other day's.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ADMIN, HOGM, sql, startDb } from "./harness";

let env: Awaited<ReturnType<typeof startDb>>;
const q: typeof env.q = (...a) => env.q(...a);
const as: typeof env.as = (...a) => env.as(...a);
const phase = async (key: string) => (await q("select * from phases where key = $1", [key]))[0];
const autostart = async () => (await q("select public.fn_game_autostart() as n"))[0].n as number;

/** Puts "<title>" from `startMin` to `endMin` minutes from now. */
const plan = (title: string, startMin: number, endMin: number) =>
  q(
    `update schedule_items set starts_at = now() + make_interval(mins => $2),
       ends_at = now() + make_interval(mins => $3), timer_state = 'idle', timer_end_override = null where title = $1`,
    [title, startMin, endMin]
  );

beforeAll(async () => {
  env = await startDb(54333, sql("tests/game-lead/bonding-phase-control.sql"));
  await q(`create table public.schedule_items (id serial primary key, day_label text, title text,
    starts_at timestamptz, ends_at timestamptz, timer_state text not null default 'idle', timer_end_override timestamptz)`);
  await q("insert into phases (key, name, duration_minutes) values ('day1', 'Day 1 Game', 150), ('day2', 'Day 2 Game', 150)");
  await q(`insert into game_config (key, value) values ('bonding_session_duration_day1', '150'::jsonb),
    ('bonding_session_duration_day2', '150'::jsonb)`);
  await q(`insert into schedule_items (day_label, title) values ('Day 1', 'Welcome Session'), ('Day 1', 'Day 1 Game'),
    ('Day 2', 'Game Stations Begin'), ('Day 2', 'Day 2 Game')`);
  await q(sql("supabase/migrations/0101_game_autostart.sql"));
}, 180_000);

afterAll(async () => {
  await env?.stop();
});

beforeEach(async () => {
  await q("update phases set state = 'pending', started_at = null, ends_at = null, paused_remaining = null");
  await q("update schedule_items set starts_at = null, ends_at = null, timer_state = 'idle', timer_end_override = null");
  await plan("Welcome Session", -30, 30);
  await plan("Game Stations Begin", -30, 30);
});

describe("fn_game_autostart (0101)", () => {
  it("does nothing before the planned start, and only for game items", async () => {
    await plan("Day 1 Game", 10, 160);
    expect(await autostart()).toBe(0);
    expect((await phase("day1")).state).toBe("pending");
  });

  it("starts the game at its planned start, to the item's end, once", async () => {
    await plan("Day 1 Game", -1, 149);
    expect(await autostart()).toBe(1);
    const p = await phase("day1");
    expect(p.state).toBe("active");
    const item = (await q("select ends_at from schedule_items where title = 'Day 1 Game'"))[0];
    expect(new Date(p.ends_at as string).getTime()).toBe(new Date(item.ends_at as string).getTime());
    expect((await q("select count(*)::int as n from session_control_log where action = 'TIMER_STARTED' and actor_user_id is null"))[0].n).toBeGreaterThan(0);
    expect(await autostart()).toBe(0);
  });

  it("uses Live control's new end time", async () => {
    await plan("Day 2 Game", -1, 149);
    await q("update schedule_items set timer_end_override = ends_at + interval '10 minutes' where title = 'Day 2 Game'");
    await autostart();
    const p = await phase("day2");
    const item = (await q("select timer_end_override from schedule_items where title = 'Day 2 Game'"))[0];
    expect(new Date(p.ends_at as string).getTime()).toBe(new Date(item.timer_end_override as string).getTime());
  });

  it("does not undo Admin's End after the planned start", async () => {
    await plan("Day 1 Game", -1, 149);
    await autostart();
    await as(ADMIN, "select public.fn_phase_control('day1', 'end', 0)");
    expect(await autostart()).toBe(0);
    expect((await phase("day1")).state).toBe("ended");
  });

  it("a test run before the planned time: Start by hand works, and the real run still starts", async () => {
    await plan("Day 1 Game", 30, 180);
    await as(HOGM, "select public.fn_phase_control('day1', 'start', 0)");
    expect((await phase("day1")).state).toBe("active");
    await as(HOGM, "select public.fn_phase_control('day1', 'end', 0)");
    // time passes: the test ran 20 minutes ago, the planned start was 1 minute ago
    await q("update phases set started_at = now() - interval '20 minutes' where key = 'day1'");
    await plan("Day 1 Game", -1, 149);
    expect(await autostart()).toBe(1);
    expect((await phase("day1")).state).toBe("active");
  });

  it("leaves a running test game alone, and waits for the other day's game", async () => {
    await as(HOGM, "select public.fn_phase_control('day1', 'start', 0)");
    const before = (await phase("day1")).started_at;
    await plan("Day 1 Game", -1, 149);
    expect(await autostart()).toBe(0);
    expect((await phase("day1")).started_at).toEqual(before);

    await plan("Day 2 Game", -1, 149);
    expect(await autostart()).toBe(0);
    expect((await phase("day2")).state).toBe("pending");
  });

  it("skips an item stopped in Live control or already over", async () => {
    await plan("Day 1 Game", -1, 149);
    await q("update schedule_items set timer_state = 'ended' where title = 'Day 1 Game'");
    await plan("Day 2 Game", -160, -10);
    expect(await autostart()).toBe(0);
  });

  it("anyone may call it", async () => {
    await plan("Day 1 Game", -1, 149);
    expect((await as(HOGM, "select public.fn_game_autostart() as n"))[0].n).toBe(1);
  });
});
