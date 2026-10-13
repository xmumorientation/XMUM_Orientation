// The live database runs the bonding-session fn_phase_control (0036), not
// this repo's. These tests run 0071 / 0072 on that version and check the
// rules Admin's Live control and HOGM's Game control are built around:
// Start uses the game_config length, time can only be added, and only one
// game runs at a time.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fails, HOF, HOGM, sql, startDb } from "./harness";

let env: Awaited<ReturnType<typeof startDb>>;
const q: typeof env.q = (...a) => env.q(...a);
const as: typeof env.as = (...a) => env.as(...a);
const phase = async (key: string) => (await q("select * from phases where key = $1", [key]))[0];
const minutesLeft = (p: Record<string, unknown>) => Math.round((new Date(p.ends_at as string).getTime() - Date.now()) / 60000);

beforeAll(async () => {
  env = await startDb(54332, sql("tests/game-lead/bonding-phase-control.sql"));
  await q("insert into phases (key, name, duration_minutes) values ('day1', 'Day 1 Game', 150), ('day2', 'Day 2 Game', 150)");
  await q(`insert into game_config (key, value) values ('bonding_session_duration_day1', '150'::jsonb),
    ('bonding_session_duration_day2', '150'::jsonb)`);
}, 180_000);

afterAll(async () => {
  await env?.stop();
});

describe("live fn_phase_control after 0071 / 0072", () => {
  it("0071 swapped only its permission check", async () => {
    const def = (await q("select pg_get_functiondef('public.fn_phase_control(text,text,integer)'::regprocedure) as d"))[0].d as string;
    expect(def).toContain("ANOTHER_SESSION_ACTIVE");
    expect(def).toContain("session_control_log");
    expect(def).toContain("public.is_game_lead()");
    expect(def).not.toContain("public.is_admin()");
  });

  it("Start uses the length HOGM saved, the way lib/gameLength saves it", async () => {
    await as(HOGM, "select public.fn_set_config('bonding_session_duration_day1', '45'::jsonb)");
    await as(HOGM, "update phases set duration_minutes = 45 where key = 'day1'");
    await as(HOGM, "select public.fn_phase_control('day1', 'start', 0)");
    const p = await phase("day1");
    expect(p.state).toBe("active");
    expect(p.duration_minutes).toBe(45);
    expect(minutesLeft(p)).toBe(45);
  });

  it("only one game at a time", async () => {
    expect(await fails(as(HOGM, "select public.fn_phase_control('day2', 'start', 0)"))).toMatch(/ANOTHER_SESSION_ACTIVE/);
  });

  it("time can be added, not taken away, also while paused", async () => {
    expect(await fails(as(HOGM, "select public.fn_phase_control('day1', 'extend', -5)"))).toMatch(/INVALID_EXTENSION/);
    await as(HOGM, "select public.fn_phase_control('day1', 'extend', 5)");
    expect(minutesLeft(await phase("day1"))).toBe(50);
    await as(HOGM, "select public.fn_phase_control('day1', 'pause', 0)");
    await as(HOGM, "select public.fn_phase_control('day1', 'extend', 5)");
    expect(Math.round(Number((await phase("day1")).paused_remaining) / 60)).toBe(55);
  });

  it("HOF cannot run the game; ending day 1 lets day 2 start", async () => {
    expect(await fails(as(HOF, "select public.fn_phase_control('day1', 'end', 0)"))).toMatch(/PERMISSION_DENIED/);
    await as(HOGM, "select public.fn_phase_control('day1', 'end', 0)");
    await as(HOGM, "select public.fn_phase_control('day2', 'start', 0)");
    expect((await phase("day2")).state).toBe("active");
    expect((await q("select count(*)::int as n from session_control_log"))[0].n).toBeGreaterThan(0);
  });
});
