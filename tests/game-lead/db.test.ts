// Database tests for migrations 0071 / 0072: HOGM gets Admin's game
// controls, and nothing more. Setup: harness.ts (repo versions of the
// patched functions).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ADMIN, COMMITTEE, fails, GM, HOF, HOGM, sql, startDb } from "./harness";

let env: Awaited<ReturnType<typeof startDb>>;
const q: typeof env.q = (...a) => env.q(...a);
const as: typeof env.as = (...a) => env.as(...a);

beforeAll(async () => {
  env = await startDb(54331);
  await q("insert into groups (id, name, token_balance, current_tokens) values (1, 'Group 1', 9, 9)");
  await q("insert into stations (code, name, day) values ('A1', 'Tug of War', 2)"); // id 1
  await q("insert into phases (key, name, duration_minutes) values ('day2', 'Day 2 Game', 90)");
  await q("insert into nfc_tokens (label) values ('B1 sticker #1')");
  await q("insert into token_logs default values");
}, 180_000);

afterAll(async () => {
  await env?.stop();
});

describe("0071 patches the installed functions", () => {
  it("keeps each function's own body and swaps only the check", async () => {
    const def = (await q("select pg_get_functiondef('public.fn_phase_control(text,text,integer)'::regprocedure) as d"))[0].d as string;
    expect(def).toContain("PHASE_NOT_FOUND");
    expect(def).toContain("public.is_game_lead()");
    expect(def).not.toContain("public.is_admin()");
  });

  it("running it twice stops with an error and changes nothing", async () => {
    const before = (await q("select pg_get_functiondef('public.fn_set_config(text,jsonb)'::regprocedure) as d"))[0].d;
    await env.db.query("begin");
    const err = await fails(env.db.query(sql("supabase/migrations/0071_hogm_game_control.sql")));
    await env.db.query("rollback");
    expect(err).toMatch(/exactly one is_admin\(\) check; nothing changed/);
    const after = (await q("select pg_get_functiondef('public.fn_set_config(text,jsonb)'::regprocedure) as d"))[0].d;
    expect(after).toBe(before);
  });
});

describe("game lead (HOGM + Admin)", () => {
  it("HOGM starts, pauses, extends and ends a game; HOF, Committee and GM cannot", async () => {
    for (const who of [HOF, COMMITTEE, GM]) {
      expect(await fails(as(who, "select public.fn_phase_control('day2', 'start', 0)"))).toMatch(/PERMISSION_DENIED/);
    }
    await as(HOGM, "select public.fn_phase_control('day2', 'start', 0)");
    expect((await q("select state from phases where key = 'day2'"))[0].state).toBe("active");
    await as(HOGM, "select public.fn_phase_control('day2', 'extend', 5)");
    await as(HOGM, "select public.fn_phase_control('day2', 'pause', 0)");
    await as(HOGM, "select public.fn_phase_control('day2', 'end', 0)");
    expect((await q("select state from phases where key = 'day2'"))[0].state).toBe("ended");
  });

  it("HOGM sets the game length; HOF cannot", async () => {
    await as(HOGM, "update phases set duration_minutes = 75 where key = 'day2'");
    expect((await q("select duration_minutes from phases where key = 'day2'"))[0].duration_minutes).toBe(75);
    // RLS hides the row from HOF: the update changes nothing.
    await as(HOF, "update phases set duration_minutes = 10 where key = 'day2'");
    expect((await q("select duration_minutes from phases where key = 'day2'"))[0].duration_minutes).toBe(75);
  });

  it("HOGM cannot add or delete phases", async () => {
    expect(await fails(as(HOGM, "insert into phases (key, name, duration_minutes) values ('x', 'X', 5)"))).toMatch(/row-level security/);
    await as(HOGM, "delete from phases where key = 'day2'");
    expect((await q("select count(*)::int as n from phases"))[0].n).toBe(1);
  });

  it("token rules: HOGM yes, Committee no, bounds kept", async () => {
    await as(HOGM, "select public.fn_update_game_config_rule('EASY_COST', 3)");
    expect((await q("select rule_value from game_config_rules where rule_key = 'EASY_COST'"))[0].rule_value).toBe(3);
    expect(await fails(as(COMMITTEE, "select public.fn_update_game_config_rule('EASY_COST', 4)"))).toMatch(/PERMISSION_DENIED/);
    expect(await fails(as(HOGM, "select public.fn_update_game_config_rule('EASY_COST', 99)"))).toMatch(/between 0 and 50/);
  });

  it("reset: HOGM only in Rehearsal mode, HOF never", async () => {
    expect(await fails(as(HOGM, "select public.fn_reset_tokens_and_puzzles()"))).toMatch(/TOKEN_RESET_LOCKED/);
    await q("insert into game_config (key, value) values ('rehearsal_mode', 'true'::jsonb)");
    expect(await fails(as(HOF, "select public.fn_reset_tokens_and_puzzles()"))).toMatch(/PERMISSION_DENIED/);
    await as(HOGM, "select public.fn_reset_tokens_and_puzzles()");
    expect((await q("select token_balance from groups where id = 1"))[0].token_balance).toBe(0);
    expect((await q("select count(*)::int as n from token_logs"))[0].n).toBe(0);
  });

  it("config: HOGM sets puzzle pictures only, never kill-switches", async () => {
    await as(HOGM, `select public.fn_set_config('puzzle_image_B1', '"https://x/b1.png"'::jsonb)`);
    expect((await q("select value #>> '{}' as v from game_config where key = 'puzzle_image_B1'"))[0].v).toBe("https://x/b1.png");
    // Game length keys the live fn_phase_control reads (0072).
    await as(HOGM, "select public.fn_set_config('bonding_session_duration_day2', '90'::jsonb)");
    expect((await q("select value #>> '{}' as v from game_config where key = 'bonding_session_duration_day2'"))[0].v).toBe("90");
    expect(await fails(as(HOF, "select public.fn_set_config('bonding_session_duration_day2', '5'::jsonb)"))).toMatch(/PERMISSION_DENIED/);
    for (const key of ["tokens_frozen", "rehearsal_mode", "puzzle_imageX", "blindbox_disabled", "bonding_session_duration", "bonding_session_duration_day3"]) {
      expect(await fails(as(HOGM, "select public.fn_set_config($1, 'true'::jsonb)", [key]))).toMatch(/PERMISSION_DENIED/);
    }
    // Admin keeps every key.
    await as(ADMIN, "select public.fn_set_config('tokens_frozen', 'false'::jsonb)");
  });

  it("stations: HOGM adds, edits and deletes; Committee cannot", async () => {
    await as(HOGM, "insert into stations (code, name, day) values ('B2', 'Water Relay', 2)");
    await as(HOGM, "update stations set status = 'available' where code = 'B2'");
    expect((await q("select status from stations where code = 'B2'"))[0].status).toBe("available");
    expect(await fails(as(COMMITTEE, "insert into stations (code, name) values ('C3', 'Nope')"))).toMatch(/row-level security/);
    await as(HOGM, "delete from stations where code = 'B2'");
    expect((await q("select count(*)::int as n from stations where code = 'B2'"))[0].n).toBe(0);
  });

  it("station Game Masters: HOGM reads and sets them; HOF cannot", async () => {
    await as(HOGM, "select public.fn_admin_set_station_gms(1, $1::uuid[])", [[GM]]);
    const rows = await as(HOGM, "select * from public.fn_admin_station_gms()");
    expect(rows).toEqual([{ user_id: GM, station_id: 1, day: 2 }]);
    expect(await fails(as(HOF, "select * from public.fn_admin_station_gms()"))).toMatch(/PERMISSION_DENIED/);
    expect(await fails(as(HOGM, "select public.fn_admin_set_station_gms(1, $1::uuid[])", [[HOF]]))).toMatch(/NOT_A_GAME_MASTER/);
  });

  it("puzzle-images uploads and NFC list: HOGM and Admin only", async () => {
    await as(HOGM, "insert into storage.objects (bucket_id, name) values ('puzzle-images', 'B1.png')");
    expect(await fails(as(COMMITTEE, "insert into storage.objects (bucket_id, name) values ('puzzle-images', 'x.png')"))).toMatch(/row-level security/);
    expect(await fails(as(HOGM, "insert into storage.objects (bucket_id, name) values ('avatars', 'x.png')"))).toMatch(/row-level security/);
    expect(await as(HOGM, "select label from nfc_tokens")).toHaveLength(1);
    expect(await as(ADMIN, "select label from nfc_tokens")).toHaveLength(1);
    expect(await as(HOF, "select label from nfc_tokens")).toHaveLength(0);
  });
});
