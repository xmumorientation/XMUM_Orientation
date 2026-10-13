// Database tests for migration 0071: HOGM gets Admin's game controls, and
// nothing more. A real Postgres runs in a temp folder (embedded-postgres) on
// the blind-box stub schema, plus the few tables these functions touch.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const sql = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const PORT = 54331;
let pg: EmbeddedPostgres;
let dataDir: string;
let db: Client;

async function connect(): Promise<Client> {
  const c = new Client({ host: "localhost", port: PORT, user: "postgres", password: "pw", database: "gl" });
  await c.connect();
  return c;
}

const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = uid(1);
const HOGM = uid(2);
const HOF = uid(3);
const COMMITTEE = uid(4);
const GM = uid(5);

type Row = Record<string, unknown>;

/** Runs one statement as `user` (role authenticated, RLS on) in its own transaction. */
async function as<T extends Row = Row>(user: string, text: string, params: unknown[] = []): Promise<T[]> {
  const c = await connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    const r = await c.query(text, params);
    await c.query("commit");
    return r.rows as T[];
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}

async function fails(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

const q = async <T extends Row = Row>(text: string, params: unknown[] = []) => (await db.query(text, params)).rows as T[];

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "gl-pg-"));
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port: PORT, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"] });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("gl");
  db = await connect();

  await db.query(sql("tests/blindbox/stub-schema.sql"));
  // The rest of the real schema these functions and policies use.
  await db.query(`
    alter table public.groups add column current_tokens integer not null default 0;
    alter table public.stations add column day integer not null default 1,
      add column status text not null default 'closed', add column area text;
    alter table public.game_config add column updated_by uuid, add column updated_at timestamptz default now();
    create table public.phases (id serial primary key, key text unique, name text, duration_minutes integer,
      state text not null default 'pending', started_at timestamptz, ends_at timestamptz, paused_remaining integer);
    create table public.game_config_rules (rule_key varchar(100) primary key, rule_value integer, updated_at timestamptz);
    create table public.gm_station_assignments (user_id uuid, day integer, station_id integer,
      created_by uuid, updated_by uuid, primary key (user_id, day));
    create table public.token_logs (log_id serial primary key);
    create table public.puzzle_inventory (id serial primary key);
    create table public.nfc_tokens (id serial primary key, label text);
    create schema storage;
    create table storage.objects (id serial primary key, bucket_id text, name text);
    grant usage on schema storage to authenticated;
    grant all on all tables in schema public, storage to authenticated;
    grant all on all sequences in schema public, storage to authenticated;
    alter table public.phases enable row level security;
    alter table public.stations enable row level security;
    alter table public.nfc_tokens enable row level security;
    alter table storage.objects enable row level security;
    create policy "all read phases" on public.phases for select using (auth.uid() is not null);
    create policy "admin manages phases" on public.phases for all using (public.is_admin()) with check (public.is_admin());
    create policy "all read stations" on public.stations for select using (auth.uid() is not null);
    create policy "admin manages stations" on public.stations for all using (public.is_admin()) with check (public.is_admin());
    create policy "admin reads nfc tokens" on public.nfc_tokens for select using (public.is_admin());
    create policy "public read puzzle images" on storage.objects for select using (bucket_id = 'puzzle-images');
    create policy "admin writes puzzle images" on storage.objects for insert with check (bucket_id = 'puzzle-images' and public.is_admin());
  `);
  await db.query(sql("supabase/migrations/0071_hogm_game_control.sql"));

  for (const [id, role] of [
    [ADMIN, "admin"],
    [HOGM, "hogm"],
    [HOF, "hof"],
    [COMMITTEE, "committee"],
    [GM, "gm"],
  ]) {
    await q("insert into profiles (id, role, full_name) values ($1, $2::user_role, $3)", [id, role, role]);
  }
  await q("insert into groups (id, name, token_balance, current_tokens) values (1, 'Group 1', 9, 9)");
  await q("insert into stations (code, name, day) values ('A1', 'Tug of War', 2)"); // id 1
  await q("insert into phases (key, name, duration_minutes) values ('day2', 'Day 2 Game', 90)");
  await q("insert into nfc_tokens (label) values ('B1 sticker #1')");
  await q("insert into token_logs default values");
}, 180_000);

afterAll(async () => {
  await db?.end();
  await pg?.stop();
  rmSync(dataDir, { recursive: true, force: true });
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
    for (const key of ["tokens_frozen", "rehearsal_mode", "puzzle_imageX", "blindbox_disabled"]) {
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
