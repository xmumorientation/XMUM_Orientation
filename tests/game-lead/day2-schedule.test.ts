// 0102 + 0115 the Day 2 game's inner schedule: a list of segments by the clock,
// segments held by hand, Admin's live flips, closed station tiers (Easy,
// Medium, Hard), and the guards it adds to the live functions (here stand-ins
// with the same names), plus "pause" refused.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ADMIN, GM, HOF, HOGM, fails, sql, startDb } from "./harness";

let env: Awaited<ReturnType<typeof startDb>>;
const q: typeof env.q = (...a) => env.q(...a);
const as: typeof env.as = (...a) => env.as(...a);

/** The Day 2 game running, started `min` minutes ago. */
const gameAt = (min: number) =>
  q(`update phases set state = 'active', started_at = now() - make_interval(mins => $1),
       ends_at = now() + interval '2 hours' where key = 'day2'`, [min]);
const control = (args: string) => as(ADMIN, `select public.fn_day2_control(${args})`);
const segment = async () => (await q("select public.fn_day2_segment() as s"))[0].s as string;
const tryFn = (fn: string) => fails(as(HOF, `select public.${fn}`));
const tryAsGm = (fn: string) => fails(as(GM, `select public.${fn}`));

const SEED = [
  { id: "s1", label: "Opening", start_min: 0, easy: true, medium: true, hard: false, blindbox: true, funfair: false },
  { id: "s2", label: "Hard Stations Open", start_min: 60, easy: true, medium: true, hard: true, blindbox: true, funfair: false },
  { id: "s3", label: "Funfair", start_min: 105, easy: true, medium: true, hard: true, blindbox: true, funfair: true },
];
/** The segments the migration left (before any test changes them). */
let migrated: typeof SEED;
const setSegments = (list: unknown) =>
  as(ADMIN, "select public.fn_day2_control('set_segments', p_segments => $1::jsonb)", [JSON.stringify(list)]);

const STANDINS = `
  create or replace function public.phase_active(p_key text) returns boolean language sql stable as $$
    select exists (select 1 from public.phases where key = p_key and state = 'active') $$;
  create function public.fn_day2_challenge(p integer) returns text language plpgsql security definer as $$
  begin
    if not (public.phase_active('day2') or public.phase_active('endgame')) then raise exception 'PHASE_LOCKED'; end if;
    return 'ok';
  end; $$;
  create function public.fn_bb_buy(p integer) returns text language plpgsql security definer as $$
  begin return 'ok'; end; $$;
  create function public.fn_bb_seller_preview(p integer) returns text language plpgsql stable security definer as $$
  begin return 'ok'; end; $$;
  create function public.fn_activate_projector(p text) returns text language plpgsql security definer as $$
  declare v integer;
  begin
    if not public.phase_active('endgame') then raise exception 'NOT_ENDGAME'; end if;
    return 'ok';
  end; $$;
  create function public.fn_demo_activate_projector(p text) returns text language plpgsql security definer as $$
  begin return 'ok'; end; $$;
  create function public.fn_schedule_timer(p_item_id integer, p_action text) returns text language plpgsql security definer as $$
  begin return p_action; end; $$;
  create function public.fn_manual_checkin(p_station_id integer) returns text language plpgsql security definer as $$
  begin return 'ok'; end; $$;
  grant execute on all functions in schema public to authenticated;
`;

beforeAll(async () => {
  env = await startDb(54334, sql("tests/game-lead/bonding-phase-control.sql"));
  await q("insert into phases (key, name, duration_minutes) values ('day1', 'Day 1 Game', 150), ('day2', 'Day 2 Game', 150), ('endgame', 'Endgame', 30)");
  await q("create type public.risk_tier as enum ('low', 'medium', 'high')");
  await q("alter table public.stations add column risk_tier public.risk_tier not null default 'low'");
  await q(`insert into stations (id, code, name, day, risk_tier) values
    (101, 'E1', 'Easy', 2, 'low'), (102, 'M1', 'Medium', 2, 'medium'), (103, 'H1', 'Hard', 2, 'high')`);
  await q("create table public.station_occupancy (group_id integer primary key, station_id integer not null)");
  await q(STANDINS);
  await q(sql("supabase/migrations/0102_day2_inner_schedule.sql"));
  await q(sql("supabase/migrations/0111_day2_blindbox_normal1.sql"));
  await q(sql("supabase/migrations/0115_day2_flexible_segments.sql"));
  // run twice: each guard is added once
  await q(sql("supabase/migrations/0115_day2_flexible_segments.sql"));
  migrated = (await q("select segments from day2_schedule"))[0].segments as typeof SEED;
}, 180_000);

afterAll(async () => {
  await env?.stop();
});

beforeEach(async () => {
  await q("update phases set state = 'pending', started_at = null, ends_at = null, paused_remaining = null");
  await q("update day2_schedule set segments = $1::jsonb, manual_segment = null, overrides = '{}', override_segment = null", [JSON.stringify(SEED)]);
  await q("delete from station_occupancy");
  await q("update profiles set station_id = 103 where id = $1", [GM]); // a Hard station
});

describe("Day 2 inner schedule (0102 + 0115)", () => {
  it("seeds the new plan: Hard opens after an hour, Funfair in the last 45 min", async () => {
    expect(migrated.map((g) => [g.start_min, g.hard, g.funfair])).toEqual([[0, false, false], [60, true, false], [105, true, true]]);
  });

  it("no game: blind box and funfair closed, every station tier open", async () => {
    expect(await segment()).toBe("off");
    expect(await tryFn("fn_bb_buy(1)")).toContain("BB_NOT_YET");
    expect(await tryFn("fn_bb_seller_preview(1)")).toContain("BB_NOT_YET");
    expect(await tryFn("fn_activate_projector('a')")).toContain("FUNFAIR_NOT_YET");
    expect(await tryFn("fn_demo_activate_projector('a')")).toContain("FUNFAIR_NOT_YET");
    expect(await tryAsGm("fn_day2_guard('station')")).toBeNull(); // Hard station, no game: open
  });

  it("follows the clock from the game's start", async () => {
    await gameAt(10);
    expect(await segment()).toBe("s1");
    expect(await tryFn("fn_bb_buy(1)")).toBeNull(); // blind boxes open with the game
    expect(await tryFn("fn_activate_projector('a')")).toContain("FUNFAIR_NOT_YET");
    await gameAt(70);
    expect(await segment()).toBe("s2");
    expect(await tryFn("fn_activate_projector('a')")).toContain("FUNFAIR_NOT_YET");
    await gameAt(110);
    expect(await segment()).toBe("s3");
    // the Endgame phase is no longer needed to light the map
    expect(await tryFn("fn_activate_projector('a')")).toBeNull();
  });

  it("a closed tier refuses the Day 2 result at that tier's stations only", async () => {
    await gameAt(10);
    expect(await tryAsGm("fn_day2_challenge(1)")).toContain("TIER_CLOSED"); // Hard, first hour
    await q("update profiles set station_id = 101 where id = $1", [GM]);
    expect(await tryAsGm("fn_day2_challenge(1)")).toBeNull(); // Easy
    await q("update profiles set station_id = 102 where id = $1", [GM]);
    expect(await tryAsGm("fn_day2_challenge(1)")).toBeNull(); // Medium
    await q("update profiles set station_id = 103 where id = $1", [GM]);
    await gameAt(65);
    expect(await tryAsGm("fn_day2_challenge(1)")).toBeNull(); // Hard has opened
    await q("update phases set state = 'pending' where key = 'day2'");
    await q("update phases set state = 'active' where key = 'endgame'");
    expect(await tryAsGm("fn_day2_challenge(1)")).toContain("PHASE_LOCKED");
  });

  it("a group already playing at a tier that closes may still submit", async () => {
    await gameAt(70);
    await q("insert into station_occupancy (group_id, station_id) values (1, 103)"); // started while Hard was open
    await control("'set_switch', p_switch => 'hard', p_on => false");
    expect(await tryAsGm("fn_day2_challenge(1)")).toBeNull();
    await q("delete from station_occupancy");
    expect(await tryAsGm("fn_day2_challenge(1)")).toContain("TIER_CLOSED");
  });

  it("Start game at a closed tier is refused for a GM, not for HOGM", async () => {
    await gameAt(10);
    expect(await tryAsGm("fn_manual_checkin(103)")).toContain("TIER_CLOSED");
    expect(await tryAsGm("fn_manual_checkin(101)")).toBeNull();
    expect(await fails(as(HOGM, "select public.fn_manual_checkin(103)"))).toBeNull();
    await gameAt(70);
    expect(await tryAsGm("fn_manual_checkin(103)")).toBeNull();
  });

  it("edits the segment list: add, change the clock's segment, restore", async () => {
    await gameAt(10);
    const next = [
      SEED[0],
      { id: "s9", label: "Lunch", start_min: 30, easy: false, medium: true, hard: false, blindbox: true, funfair: false },
      ...SEED.slice(1),
    ];
    await setSegments(next);
    const s = (await as(HOF, "select public.fn_day2_state() as s"))[0].s as { segments: typeof SEED; game_on: boolean };
    expect(s.game_on).toBe(true);
    expect(s.segments.map((g) => g.id)).toEqual(["s1", "s9", "s2", "s3"]);
    await gameAt(35);
    expect(await segment()).toBe("s9");
    await setSegments(SEED);
    expect(await segment()).toBe("s1");
  });

  it("refuses bad lists", async () => {
    const bad = async (list: unknown) => expect(await fails(setSegments(list))).toContain("BAD_SEGMENTS");
    await bad([]);
    await bad([{ ...SEED[0], start_min: 5 }]); // the first starts at 0
    await bad([SEED[0], { ...SEED[1], start_min: 0 }]); // strictly later
    await bad([SEED[0], SEED[0]]); // unique ids
    await bad([{ ...SEED[0], hard: "yes" }]); // switches are booleans
    await bad(Array.from({ length: 9 }, (_, i) => ({ ...SEED[0], id: `x${i}`, start_min: i * 10 }))); // at most 8
  });

  it("a flip lasts until the segment changes", async () => {
    await gameAt(70);
    await control("'set_switch', p_switch => 'blindbox', p_on => false");
    expect(await tryFn("fn_bb_buy(1)")).toContain("BB_OFF_BY_ADMIN");
    await control("'set_switch', p_switch => 'hard', p_on => false");
    expect(await tryAsGm("fn_day2_challenge(1)")).toContain("TIER_CLOSED");
    await control("'set_switch', p_switch => 'funfair', p_on => true");
    expect(await tryFn("fn_activate_projector('a')")).toBeNull();
    await gameAt(110);
    expect(await tryFn("fn_bb_buy(1)")).toBeNull();
    expect(await tryAsGm("fn_day2_challenge(1)")).toBeNull();
  });

  it("a time edit that moves the clock to another segment clears the flip", async () => {
    await gameAt(70);
    await control("'set_switch', p_switch => 'hard', p_on => false");
    await setSegments([SEED[0], { ...SEED[1], start_min: 80 }, SEED[2]]); // 70 min is now in s1
    expect(await segment()).toBe("s1");
    const row = (await q("select override_segment from day2_schedule"))[0];
    expect(row.override_segment).toBeNull();
  });

  it("a segment started by hand holds with no game on, until Back to auto; add and remove wait", async () => {
    await control("'start_segment', p_segment => 's3'");
    expect(await segment()).toBe("s3");
    expect(await tryFn("fn_activate_projector('a')")).toBeNull();
    expect(await fails(setSegments([...SEED, { ...SEED[2], id: "s4", start_min: 120 }]))).toContain("SEGMENT_HELD");
    expect(await fails(setSegments([SEED[0], SEED[2]]))).toContain("SEGMENT_HELD");
    expect(await fails(setSegments([SEED[0], SEED[1], { ...SEED[2], start_min: 100 }]))).toBeNull(); // a time edit is fine
    expect(await fails(control("'start_segment', p_segment => 'nope'"))).toContain("UNKNOWN_ACTION");
    await control("'auto'");
    expect(await segment()).toBe("off");
    expect(await tryFn("fn_activate_projector('a')")).toContain("FUNFAIR_NOT_YET");
  });

  it("control is Admin only", async () => {
    expect(await fails(as(HOGM, "select public.fn_day2_control('auto')"))).toContain("PERMISSION_DENIED");
  });

  it("refuses pause, keeps the other actions; each guard added once", async () => {
    await gameAt(10);
    expect(await fails(as(ADMIN, "select public.fn_phase_control('day2', 'pause', 0)"))).toContain("NO_PAUSE");
    expect(await fails(as(ADMIN, "select public.fn_phase_control('day2', 'extend', 5)"))).toBeNull();
    expect(await tryFn("fn_schedule_timer(1, 'pause')")).toContain("NO_PAUSE");
    expect(await tryFn("fn_schedule_timer(1, 'extend')")).toBeNull();
    for (const [fn, guard] of [
      ["fn_bb_buy(integer)", "fn_day2_guard"],
      ["fn_manual_checkin(integer)", "fn_day2_guard_checkin"],
    ]) {
      const def = (await q(`select pg_get_functiondef('public.${fn}'::regprocedure) as d`))[0].d as string;
      expect(def.split(guard).length - 1).toBe(1);
    }
  });
});
