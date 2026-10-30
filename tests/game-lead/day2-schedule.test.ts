// 0102 the Day 2 game's inner schedule: segments by the clock, segments held by
// hand, Admin's switch flips, and the guards it adds to the live functions
// (here stand-ins with the same names), plus "pause" refused.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ADMIN, HOF, HOGM, fails, sql, startDb } from "./harness";

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
  grant execute on all functions in schema public to authenticated;
`;

beforeAll(async () => {
  env = await startDb(54334, sql("tests/game-lead/bonding-phase-control.sql"));
  await q("insert into phases (key, name, duration_minutes) values ('day1', 'Day 1 Game', 150), ('day2', 'Day 2 Game', 150), ('endgame', 'Endgame', 30)");
  await q(STANDINS);
  await q(sql("supabase/migrations/0102_day2_inner_schedule.sql"));
  // run twice: each guard is added once
  await q(sql("supabase/migrations/0102_day2_inner_schedule.sql"));
  await q(sql("supabase/migrations/0111_day2_blindbox_normal1.sql"));
}, 180_000);

afterAll(async () => {
  await env?.stop();
});

beforeEach(async () => {
  await q("update phases set state = 'pending', started_at = null, ends_at = null, paused_remaining = null");
  await q(`update day2_schedule set challenge_start_min = 60, challenge_end_min = 90, funfair_start_min = 120,
    manual_segment = null, overrides = '{}', override_segment = null`);
});

describe("Day 2 inner schedule (0102)", () => {
  it("no game: blind box and funfair closed, station game open", async () => {
    expect(await segment()).toBe("off");
    expect(await tryFn("fn_bb_buy(1)")).toContain("BB_NOT_YET");
    expect(await tryFn("fn_bb_seller_preview(1)")).toContain("BB_NOT_YET");
    expect(await tryFn("fn_activate_projector('a')")).toContain("FUNFAIR_NOT_YET");
    expect(await tryFn("fn_demo_activate_projector('a')")).toContain("FUNFAIR_NOT_YET");
  });

  it("follows the clock from the game's start", async () => {
    await gameAt(10);
    expect(await segment()).toBe("normal1");
    expect(await tryFn("fn_day2_challenge(1)")).toBeNull();
    // blind boxes open with the game (0111)
    expect(await tryFn("fn_bb_buy(1)")).toBeNull();
    await gameAt(70);
    expect(await segment()).toBe("challenge");
    expect(await tryFn("fn_bb_buy(1)")).toBeNull();
    expect(await tryFn("fn_activate_projector('a')")).toContain("FUNFAIR_NOT_YET");
    await gameAt(100);
    expect(await segment()).toBe("normal2");
    await gameAt(125);
    expect(await segment()).toBe("funfair");
    // the Endgame phase is no longer needed to light the map
    expect(await tryFn("fn_activate_projector('a')")).toBeNull();
  });

  it("moves the boundaries", async () => {
    await gameAt(30);
    await control("'set_times', p_challenge_start_min => 20, p_challenge_end_min => 40, p_funfair_start_min => 50");
    expect(await segment()).toBe("challenge");
    expect(await fails(control("'set_times', p_challenge_start_min => 50, p_challenge_end_min => 40"))).toBeTruthy();
  });

  it("a flip lasts until the segment changes", async () => {
    await gameAt(70);
    await control("'set_switch', p_switch => 'blindbox', p_on => false");
    expect(await tryFn("fn_bb_buy(1)")).toContain("BB_OFF_BY_ADMIN");
    await control("'set_switch', p_switch => 'funfair', p_on => true");
    expect(await tryFn("fn_activate_projector('a')")).toBeNull();
    expect(await tryFn("fn_bb_buy(1)")).toContain("BB_OFF_BY_ADMIN");
    await gameAt(100);
    expect(await tryFn("fn_bb_buy(1)")).toBeNull();
    expect(await tryFn("fn_activate_projector('a')")).toContain("FUNFAIR_NOT_YET");
  });

  it("station game switch gates the Day 2 result; the Endgame phase is not needed", async () => {
    await gameAt(10);
    await control("'set_switch', p_switch => 'station', p_on => false");
    expect(await tryFn("fn_day2_challenge(1)")).toContain("STATION_GAME_OFF");
    await control("'set_switch', p_switch => 'station', p_on => true");
    expect(await tryFn("fn_day2_challenge(1)")).toBeNull();
    await q("update phases set state = 'pending' where key = 'day2'");
    await q("update phases set state = 'active' where key = 'endgame'");
    expect(await tryFn("fn_day2_challenge(1)")).toContain("PHASE_LOCKED");
  });

  it("a segment started by hand holds with no game on, until Back to auto", async () => {
    await control("'start_segment', p_segment => 'funfair'");
    expect(await segment()).toBe("funfair");
    expect(await tryFn("fn_activate_projector('a')")).toBeNull();
    expect(await tryFn("fn_bb_buy(1)")).toBeNull();
    await control("'auto'");
    expect(await segment()).toBe("off");
    expect(await tryFn("fn_activate_projector('a')")).toContain("FUNFAIR_NOT_YET");
  });

  it("state for every page; control is Admin only", async () => {
    await gameAt(70);
    const s = (await as(HOF, "select public.fn_day2_state() as s"))[0].s as Record<string, unknown>;
    expect(s.game_on).toBe(true);
    expect(s.challenge_start_min).toBe(60);
    expect(await fails(as(HOGM, "select public.fn_day2_control('auto')"))).toContain("PERMISSION_DENIED");
  });

  it("refuses pause, keeps the other actions; each guard added once", async () => {
    await gameAt(10);
    expect(await fails(as(ADMIN, "select public.fn_phase_control('day2', 'pause', 0)"))).toContain("NO_PAUSE");
    expect(await fails(as(ADMIN, "select public.fn_phase_control('day2', 'extend', 5)"))).toBeNull();
    expect(await tryFn("fn_schedule_timer(1, 'pause')")).toContain("NO_PAUSE");
    expect(await tryFn("fn_schedule_timer(1, 'extend')")).toBeNull();
    const def = (await q("select pg_get_functiondef('public.fn_bb_buy(integer)'::regprocedure) as d"))[0].d as string;
    expect(def.split("fn_day2_guard").length - 1).toBe(1);
  });
});
