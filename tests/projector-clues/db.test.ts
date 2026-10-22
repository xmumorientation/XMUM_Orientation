// Database tests for migration 0098: a projector's picture and place reach a
// Freshie or Faci only once their group holds all 5 pieces of its key, or lit
// it. Staff read them as before. Setup: stub-schema.sql, then the real 0098.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const PORT = 54332;
let pg: EmbeddedPostgres;
let dataDir: string;
let admin: Client;

const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const FRESHIE = uid(1); // group 1
const FACI = uid(2); // group 1
const OTHER = uid(3); // group 2
const GM = uid(4);

type Row = Record<string, unknown>;
const q = async (text: string, params: unknown[] = []) => (await admin.query(text, params)).rows as Row[];

/** Runs `text` as a signed-in user, as PostgREST would. */
async function as(user: string, text: string): Promise<Row[]> {
  const c = new Client({ host: "localhost", port: PORT, user: "postgres", password: "pw", database: "pc" });
  await c.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    const r = await c.query(text);
    await c.query("commit");
    return r.rows as Row[];
  } finally {
    await c.end();
  }
}
const clues = (user: string) => as(user, "select * from public.fn_my_projector_clues()");
const keys = async (user: string) =>
  (await as(user, "select key from public.game_config order by key")).map((r) => r.key);

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "pc-db-"));
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port: PORT, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"] });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("pc");
  admin = new Client({ host: "localhost", port: PORT, user: "postgres", password: "pw", database: "pc" });
  await admin.connect();
  await admin.query(read("tests/projector-clues/stub-schema.sql"));
  await admin.query(read("supabase/migrations/0098_projector_clues.sql"));

  await q("insert into groups (id, name) values (1, 'Group 1'), (2, 'Group 2')");
  await q(
    `insert into profiles (id, role, group_id) values
       ($1, 'freshie', 1), ($2, 'faci', 1), ($3, 'freshie', 2), ($4, 'gm', null)`,
    [FRESHIE, FACI, OTHER, GM]
  );
  await q(`insert into items (type, puzzle_location, puzzle_index)
           select 'puzzle', l, i from unnest(array['B1','A3','TF']::projector_location[]) l, generate_series(1, 5) i`);
  await q("insert into projectors (location) values ('B1'), ('A3'), ('TF')");
  await q(`insert into game_config (key, value) values
    ('event_name', '"Vortexa"'),
    ('puzzle_image_B1', '"https://x/b1.png"'),
    ('projector_place_B1', '{"name": "Library", "short": "Lib"}'),
    ('puzzle_image_A3', '"https://x/a3.png"')`);
  // Group 1: four B1 pieces so far.
  await q("insert into inventory (group_id, item_id) select 1, id from items where puzzle_location = 'B1' and puzzle_index <= 4");
}, 180_000);

afterAll(async () => {
  await admin?.end();
  await pg?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe("0098 projector clues", () => {
  it("hides pictures and places from Freshie and Faci in game_config", async () => {
    expect(await keys(FRESHIE)).toEqual(["event_name"]);
    expect(await keys(FACI)).toEqual(["event_name"]);
    expect(await keys(GM)).toEqual(["event_name", "projector_place_B1", "puzzle_image_A3", "puzzle_image_B1"]);
  });

  it("gives nothing for 4 of 5 pieces", async () => {
    expect(await clues(FRESHIE)).toEqual([]);
  });

  it("gives the picture and place once the key is complete, to that group only", async () => {
    await q("insert into inventory (group_id, item_id) select 1, id from items where puzzle_location = 'B1' and puzzle_index = 5");
    const b1 = { location: "B1", name: "Library", short: "Lib", image_url: "https://x/b1.png" };
    expect(await clues(FRESHIE)).toEqual([b1]);
    expect(await clues(FACI)).toEqual([b1]);
    expect(await clues(OTHER)).toEqual([]);
  });

  it("gives a projector the group lit, with nulls for what Admin has not set", async () => {
    await q("update projectors set activated_by_group = 2, activated_at = now() where location = 'A3'");
    expect(await clues(OTHER)).toEqual([{ location: "A3", name: null, short: null, image_url: "https://x/a3.png" }]);
    expect((await clues(FRESHIE)).map((r) => r.location)).toEqual(["B1"]);
  });

  it("gives staff all three", async () => {
    expect((await clues(GM)).map((r) => r.location)).toEqual(["B1", "A3", "TF"]);
  });
});
