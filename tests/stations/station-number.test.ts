// Migration 0119: a new station gets the next free station_number for its day.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

const read = (p: string) => readFileSync(path.join(path.resolve(__dirname, "../.."), p), "utf8");
const PORT = 54352;
let pg: EmbeddedPostgres;
let dataDir: string;
let db: Client;

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "st-num-pg-"));
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port: PORT, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"] });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("st");
  db = new Client({ host: "localhost", port: PORT, user: "postgres", password: "pw", database: "st" });
  await db.connect();
  await db.query(`
    create table public.stations (
      id serial primary key, code text not null, name text not null, day integer not null default 1,
      station_number integer not null, station_name text not null,
      constraint stations_number_day_unique unique (station_number, day)
    );`);
  await db.query(read("supabase/migrations/0061_station_number.sql")); // old behaviour first
}, 120_000);

afterAll(async () => {
  await db?.end().catch(() => {});
  await pg?.stop().catch(() => {});
  try {
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* temp folder */
  }
});

const add = async (code: string, day = 1) =>
  Number((await db.query("insert into stations (code, name, day) values ($1, $1, $2) returning station_number", [code, day])).rows[0].station_number);

it("0061 alone collides on a non-numeric floor (the bug)", async () => {
  await add("A1-1");
  await expect(add("A1-ny")).rejects.toThrow(/stations_number_day_unique/);
});

it("0119 numbers by day, whatever the code says", async () => {
  await db.query("truncate stations");
  await db.query(read("supabase/migrations/0119_station_number_next_free.sql"));
  expect(await add("A1-1")).toBe(1);
  expect(await add("A1-ny")).toBe(2);
  expect(await add("A2-1")).toBe(3);
  expect(await add("B1-1", 2)).toBe(1); // each day counts on its own
});
