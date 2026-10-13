// Station status is manual (migration 0072, changesv3.md).
// Real Postgres (embedded-postgres) + a small Supabase stub. The OLD timer
// trigger from 0049 is installed first, so the first test proves the problem
// existed (a game ending closed the stations) before 0072 removes it.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const PORT = 54330;
let pg: EmbeddedPostgres;
let dataDir: string;
let admin: Client;

const connect = async () => {
  const c = new Client({ host: "localhost", port: PORT, user: "postgres", password: "pw", database: "st" });
  await c.connect();
  return c;
};

const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = uid(1);
const HOF = uid(2);
const GM_A = uid(3); // works at station A
const GM_B = uid(4); // works at station B
const GUARDIAN = uid(5); // works at station A
const FACI = uid(6); // group 1
const FRESHIE = uid(7);

type Row = Record<string, unknown>;

async function rpc(user: string, fn: string, args: unknown[] = []): Promise<Row> {
  const c = await connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    const ph = args.map((_, i) => `$${i + 1}`).join(", ");
    const r = await c.query(`select public.${fn}(${ph}) as r`, args);
    await c.query("commit");
    return r.rows[0].r as Row;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}
const fails = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};
const q = async (text: string, params: unknown[] = []) => (await admin.query(text, params)).rows as Row[];
const status = async (id: number) => String((await q("select status from stations where id=$1", [id]))[0].status);

let A: number; // Day 1 station, GM_A
let B: number; // Day 1 station, GM_B
let D2: number; // Day 2 station

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "st-pg-"));
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port: PORT, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"] });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("st");
  admin = await connect();

  await admin.query(read("tests/stations/stub-schema.sql"));

  // The OLD behaviour (0049): stations follow their day's game.
  const m49 = read("supabase/migrations/0049_live_control.sql");
  const from = m49.indexOf("create or replace function public.trg_phase_station_status()");
  const endMarker = "for each row execute function public.trg_phase_station_status();";
  const to = m49.indexOf(endMarker) + endMarker.length;
  await admin.query(m49.slice(from, to));

  await admin.query(read("supabase/migrations/0062_station_capacity.sql"));
  await admin.query(read("supabase/migrations/0064_building_geofence.sql"));

  await q("insert into groups (id, name) values (1, 'Group 1'), (2, 'Group 2'), (3, 'Group 3')");
  await q("insert into phases (key, state) values ('day1', 'pending'), ('day2', 'pending'), ('endgame', 'pending')");
  A = Number((await q("insert into stations (code, name, day, status, max_groups) values ('A1-1', 'Station A', 1, 'closed', 2) returning id"))[0].id);
  B = Number((await q("insert into stations (code, name, day, status) values ('A2-1', 'Station B', 1, 'closed') returning id"))[0].id);
  D2 = Number((await q("insert into stations (code, name, day, status) values ('B1-1', 'Day 2 station', 2, 'closed') returning id"))[0].id);

  await q("insert into profiles (id, role, full_name) values ($1, 'admin', 'Admin'), ($2, 'hof', 'HOF')", [ADMIN, HOF]);
  await q("insert into profiles (id, role, full_name, station_id) values ($1, 'gm', 'GM A', $4), ($2, 'gm', 'GM B', $5), ($3, 'guardian_gm', 'Guardian', $4)", [GM_A, GM_B, GUARDIAN, A, B]);
  await q("insert into profiles (id, role, full_name, group_id) values ($1, 'faci', 'Faci', 1), ($2, 'freshie', 'Freshie', 1)", [FACI, FRESHIE]);
}, 120_000);

afterAll(async () => {
  await admin?.end().catch(() => {});
  await pg?.stop().catch(() => {});
  // Windows can keep the folder locked for a moment after Postgres stops; it is a temp folder.
  try {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* left for the OS temp cleanup */
  }
});

describe("before 0072 (proves the old coupling)", () => {
  it("a game starting opens its day's stations and ending closes them", async () => {
    await q("update phases set state = 'active' where key = 'day1'");
    expect(await status(A)).toBe("available");
    expect(await status(B)).toBe("available");
    expect(await status(D2)).toBe("closed"); // other day untouched
    await q("update stations set status = 'in_progress' where id = $1", [A]);
    await q("update phases set state = 'ended' where key = 'day1'");
    expect(await status(A)).toBe("closed"); // even in-progress ones
    expect(await status(B)).toBe("closed");
  });
});

describe("after 0072", () => {
  beforeAll(async () => {
    await q("update phases set state = 'pending'");
    await admin.query(read("supabase/migrations/0072_station_status_manual.sql"));
    await q("update stations set status = 'closed'");
  });

  it("is idempotent to re-run", async () => {
    await admin.query(read("supabase/migrations/0072_station_status_manual.sql"));
  });

  it("starting, pausing, ending and resetting a game never changes any station status", async () => {
    await q("update stations set status = 'available' where id = $1", [A]);
    await q("update stations set status = 'in_progress' where id = $1", [B]);
    // D2 stays closed
    for (const key of ["day1", "day2"]) {
      for (const state of ["active", "paused", "active", "ended", "pending", "active", "ended"]) {
        await q("update phases set state = $1 where key = $2", [state, key]);
        expect(await status(A)).toBe("available");
        expect(await status(B)).toBe("in_progress");
        expect(await status(D2)).toBe("closed");
      }
    }
  });

  it("Admin sets any station to each of the three states", async () => {
    for (const s of ["in_progress", "closed", "available"]) {
      const r = await rpc(ADMIN, "fn_set_station_status", [D2, s]);
      expect(r.ok).toBe(true);
      expect(await status(D2)).toBe(s);
    }
    expect(await fails(rpc(ADMIN, "fn_set_station_status", [99999, "available"]))).toMatch(/STATION_NOT_FOUND/);
    expect(Number((await q("select count(*) n from audit_log where action = 'station.status'"))[0].n)).toBeGreaterThanOrEqual(3);
  });

  it("HOF can set any station too", async () => {
    await rpc(HOF, "fn_set_station_status", [B, "closed"]);
    expect(await status(B)).toBe("closed");
  });

  it("a Game Master sets only their own station, to each of the three states", async () => {
    for (const s of ["in_progress", "closed", "available"]) {
      await rpc(GM_A, "fn_set_station_status", [A, s]);
      expect(await status(A)).toBe(s);
    }
    await rpc(GUARDIAN, "fn_set_station_status", [A, "in_progress"]);
    expect(await status(A)).toBe("in_progress");
  });

  it("a Game Master cannot change another station; Faci and Freshie cannot change any", async () => {
    await q("update stations set status = 'closed' where id = $1", [B]);
    expect(await fails(rpc(GM_A, "fn_set_station_status", [B, "available"]))).toMatch(/NOT_YOUR_STATION/);
    expect(await fails(rpc(GM_B, "fn_set_station_status", [A, "closed"]))).toMatch(/NOT_YOUR_STATION/);
    expect(await fails(rpc(GM_A, "fn_set_station_status", [D2, "available"]))).toMatch(/NOT_YOUR_STATION/);
    expect(await fails(rpc(FACI, "fn_set_station_status", [A, "closed"]))).toMatch(/PERMISSION_DENIED/);
    expect(await fails(rpc(FRESHIE, "fn_set_station_status", [A, "closed"]))).toMatch(/PERMISSION_DENIED/);
    expect(await status(B)).toBe("closed");
  });

  it("a Game Master changing their assignment (a different day's station) controls the new one", async () => {
    await q("update profiles set station_id = $1 where id = $2", [D2, GM_A]);
    await rpc(GM_A, "fn_set_station_status", [D2, "available"]);
    expect(await status(D2)).toBe("available");
    expect(await fails(rpc(GM_A, "fn_set_station_status", [A, "closed"]))).toMatch(/NOT_YOUR_STATION/);
    await q("update profiles set station_id = $1 where id = $2", [A, GM_A]);
  });

  it("a Closed station refuses check-in; Available and In Progress accept it", async () => {
    await rpc(ADMIN, "fn_set_station_status", [A, "closed"]);
    await q("update profiles set group_id = 1 where id = $1", [ADMIN]);
    expect(await fails(rpc(FACI, "fn_manual_checkin", [A]))).toMatch(/STATION_CLOSED/);
    await rpc(ADMIN, "fn_set_station_status", [A, "in_progress"]);
    expect((await rpc(FACI, "fn_manual_checkin", [A])).ok).toBe(true);
    await rpc(FACI, "fn_uncheckin");
    await rpc(ADMIN, "fn_set_station_status", [A, "available"]);
    expect((await rpc(FACI, "fn_manual_checkin", [A])).ok).toBe(true);
    await rpc(FACI, "fn_uncheckin");
  });

  it("check-in, check-out, clearing and a full station never change the status", async () => {
    // A holds at most 2 groups
    await q("insert into profiles (id, role, full_name, group_id) values ($1, 'faci', 'Faci 2', 2), ($2, 'faci', 'Faci 3', 3)", [uid(8), uid(9)]);
    for (const wanted of ["available", "in_progress"]) {
      await rpc(ADMIN, "fn_set_station_status", [A, wanted]);
      await rpc(FACI, "fn_manual_checkin", [A]);
      expect(await status(A)).toBe(wanted);
      await rpc(uid(8), "fn_manual_checkin", [A]);
      expect(await status(A)).toBe(wanted); // now full: still not flipped
      expect(await fails(rpc(uid(9), "fn_manual_checkin", [A]))).toMatch(/STATION_FULL/); // the limit still works
      expect(await status(A)).toBe(wanted);
      await rpc(uid(8), "fn_uncheckin");
      expect(await status(A)).toBe(wanted);
      await rpc(GM_A, "fn_clear_station", [A]);
      expect(await status(A)).toBe(wanted);
      expect(Number((await q("select count(*) n from station_occupancy where station_id = $1", [A]))[0].n)).toBe(0);
    }
  });

  it("changing a station's capacity never changes the status", async () => {
    await rpc(ADMIN, "fn_set_station_status", [A, "available"]);
    await q("update stations set max_groups = 1 where id = $1", [A]);
    await q("update stations set max_groups = 5 where id = $1", [A]);
    expect(await status(A)).toBe("available");
  });

  it("a status set by one role is what the other role reads (one source of truth)", async () => {
    await rpc(ADMIN, "fn_set_station_status", [A, "closed"]);
    expect(await status(A)).toBe("closed");
    await rpc(GM_A, "fn_set_station_status", [A, "in_progress"]);
    expect(await status(A)).toBe("in_progress");
    await rpc(ADMIN, "fn_set_station_status", [A, "available"]);
    expect(await status(A)).toBe("available");
  });

  it("nobody but the signed-in roles can call it", async () => {
    const c = await connect();
    try {
      await c.query("begin");
      await c.query("set local role anon");
      await expect(c.query("select public.fn_set_station_status($1, 'available')", [A])).rejects.toThrow(/permission denied/);
    } finally {
      await c.query("rollback").catch(() => {});
      await c.end();
    }
  });
});
