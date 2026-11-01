// Migration 0110: fn_group_positions() finds each phone's newest fix by
// skipping through the new index. It must return exactly what 0108 returned.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const PORT = 54341;
let pg: EmbeddedPostgres;
let dataDir: string;
let admin: Client;

const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const VIEWER = uid(1);

async function positions(): Promise<Record<string, unknown>[]> {
  await admin.query("begin");
  try {
    await admin.query("set local role authenticated");
    await admin.query("select set_config('request.jwt.claim.sub', $1, true)", [VIEWER]);
    const r = await admin.query("select * from public.fn_group_positions()");
    return r.rows;
  } finally {
    await admin.query("rollback");
  }
}

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "gp-pg-"));
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port: PORT, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"] });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("gp");
  admin = new Client({ host: "localhost", port: PORT, user: "postgres", password: "pw", database: "gp" });
  await admin.connect();

  await admin.query(read("tests/stations/stub-schema.sql"));
  await admin.query("alter table public.profiles add column if not exists phone text");
  await admin.query("create table public.station_occupancy (group_id integer primary key, station_id integer, checked_in_at timestamptz)");
  await admin.query("grant select on all tables in schema public to authenticated");
  await admin.query(read("supabase/migrations/0108_group_positions_everyone.sql"));

  await admin.query("insert into groups (id, name) select g, 'G' || g from generate_series(1, 6) g");
  await admin.query("insert into profiles (id, role, full_name) values ($1, 'committee', 'Viewer')", [VIEWER]);
  await admin.query(
    `insert into profiles (id, role, full_name, group_id)
     select ('00000000-0000-0000-0000-' || lpad((g * 10 + f)::text, 12, '0'))::uuid, 'faci', 'F', g
       from generate_series(1, 5) g, generate_series(1, 3) f`
  );
  // An hour of fixes, every 12 s, from three phones in each of groups 1-5.
  await admin.query(
    `insert into group_locations (group_id, source, lat, lng, accuracy_m, reported_by, created_at)
     select g, 'gps', g + f / 10.0, i / 1000.0, 5 + (g * 7 + f * 3 + i) % 30,
            ('00000000-0000-0000-0000-' || lpad((g * 10 + f)::text, 12, '0'))::uuid,
            now() - i * interval '12 seconds'
       from generate_series(1, 5) g, generate_series(1, 3) f, generate_series(0, 299) i`
  );
  await admin.query("insert into profiles (id, role, full_name, group_id) values ($1, 'faci', 'Old', 6)", [uid(9991)]);
  await admin.query(
    `insert into group_locations (group_id, source, lat, lng, accuracy_m, reported_by, created_at) values
       -- a phone whose only fix is past the 12 h window
       (6, 'gps', 1, 1, 3, $1, now() - interval '13 hours'),
       -- fixes with no reporter
       (2, 'gps', 9, 9, 1, null, now() - interval '5 seconds'),
       (6, 'gps', 8, 8, 2, null, now() - interval '1 minute'),
       -- an old extra fix and a fresh precise one
       (3, 'gps', 7, 7, 1, $2, now() - interval '13 hours'),
       (4, 'gps', 6, 6, 0.5, $3, now()),
       -- a manual check-in row is not a GPS fix
       (5, 'manual', null, null, null, $4, now())`,
    [uid(9991), uid(31), uid(42), uid(51)]
  );
  await admin.query("analyze");
}, 120_000);

afterAll(async () => {
  await admin?.end();
  await pg?.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("0110 fn_group_positions", () => {
  it("returns the same rows as 0108, and runs twice", async () => {
    const before = await positions();
    await admin.query(read("supabase/migrations/0110_group_locations_per_faci_idx.sql"));
    await admin.query(read("supabase/migrations/0110_group_locations_per_faci_idx.sql"));
    await admin.query("analyze");
    const after = await positions();

    expect(after).toHaveLength(6);
    expect(after).toEqual(before);
    // Group 6: the 13 h old fix is out of the window; the reporter-less fix counts.
    expect(after[5]).toMatchObject({ group_id: 6, gps_lat: 8, facis_reporting: 1 });
    // Group 4: the fresh 0.5 m fix wins.
    expect(after[3]).toMatchObject({ group_id: 4, gps_lat: 6, facis_reporting: 3 });
  });

  it("uses the new index for one phone's newest fix", async () => {
    const plan = (
      await admin.query(
        `explain select created_at from group_locations
          where source = 'gps' and group_id = 3 and reported_by = $1
          order by created_at desc limit 1`,
        [uid(31)]
      )
    ).rows.map((r) => r["QUERY PLAN"]).join("\n");
    expect(plan).toContain("group_locations_gps_per_faci_idx");
  });
});
