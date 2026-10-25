import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
let pg: EmbeddedPostgres;
let db: Client;
let dir: string;
async function asUser(n: number, sql: string) {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid(n)]);
    const result = await db.query(sql);
    await db.query("commit");
    return result.rows;
  } catch (e) { await db.query("rollback"); throw e; }
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "staff-gps-"));
  pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port: 54339, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"] });
  await pg.initialise(); await pg.start(); await pg.createDatabase("staff");
  db = new Client({ host: "localhost", port: 54339, user: "postgres", password: "pw", database: "staff" });
  await db.connect();
  await db.query(readFileSync(path.join(root, "tests/stations/stub-schema.sql"), "utf8"));
  await db.query(readFileSync(path.join(root, "supabase/migrations/0103_staff_location_sharing.sql"), "utf8"));
  for (const [n, role] of [[1,"hof"],[2,"hogm"],[3,"faci"],[4,"freshie"],[5,"admin"],[6,"gm"]]) {
    await db.query("insert into profiles(id, role, full_name) values ($1,$2::user_role,$3)", [uid(Number(n)), role, role]);
  }
});
afterAll(async () => { await db?.end(); await pg?.stop(); if (dir) rmSync(dir, { recursive: true, force: true }); });
it("shares only after explicit opt-in; stop clears the pin and delayed fixes cannot restore it", async () => {
  expect(await asUser(3, "select * from fn_staff_positions()" )).toHaveLength(0);
  await asUser(1, "select fn_report_staff_gps(2.8,101.7,10)");
  expect(await asUser(3, "select * from fn_staff_positions()" )).toHaveLength(0);
  await asUser(1, "select fn_staff_location_share(true)");
  await asUser(1, "select fn_report_staff_gps(2.8,101.7,10)");
  expect(await asUser(3, "select * from fn_staff_positions()" )).toHaveLength(1);
  expect(await asUser(6, "select * from fn_staff_positions()" )).toHaveLength(1);
  await asUser(1, "select fn_staff_location_share(false)");
  await asUser(1, "select fn_report_staff_gps(2.9,101.8,10)");
  expect(await asUser(3, "select * from fn_staff_positions()" )).toHaveLength(0);
  expect((await db.query("select lat, lng from staff_locations")).rows[0]).toEqual({ lat: null, lng: null });
});
it("supports HOGM; denies Freshies and unprivileged writes", async () => {
  await asUser(2, "select fn_staff_location_share(true)");
  await asUser(2, "select fn_report_staff_gps(2.8,101.7,10)");
  expect(await asUser(5, "select * from fn_staff_positions()" )).toHaveLength(1);
  expect(await asUser(4, "select * from fn_staff_positions()" )).toHaveLength(0);
  for (const n of [3,4,5,6]) {
    await expect(asUser(n, "select fn_staff_location_share(true)")).rejects.toThrow("PERMISSION_DENIED");
    await expect(asUser(n, "select fn_report_staff_gps(2.8,101.7,10)")).rejects.toThrow("PERMISSION_DENIED");
  }
  await expect(asUser(2, "select * from staff_locations")).rejects.toThrow(/permission denied/);
});
it("rejects invalid coordinates, hides stale fixes, and stopping one person leaves others alone", async () => {
  await expect(asUser(2, "select fn_report_staff_gps('NaN',101.7,10)")).rejects.toThrow("INVALID_POSITION");
  await expect(asUser(2, "select fn_report_staff_gps(91,101.7,10)")).rejects.toThrow("INVALID_POSITION");
  await asUser(1, "select fn_staff_location_share(false)");
  expect(await asUser(5, "select * from fn_staff_positions()" )).toHaveLength(1);
  await db.query("update staff_locations set updated_at = now() - interval '3 minutes'");
  expect(await asUser(5, "select * from fn_staff_positions()" )).toHaveLength(0);
  await asUser(2, "select fn_staff_location_share(false)");
});
