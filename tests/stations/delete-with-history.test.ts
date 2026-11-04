// Migration 0116: fn_delete_station_with_history.
// Real Postgres (embedded-postgres) + the small Supabase stub from the station tests.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const PORT = 54331;
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
const HOGM = uid(2);
const GM = uid(3);

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
const exists = async (id: number) => (await q("select 1 from stations where id=$1", [id])).length === 1;
const rehearsal = (on: boolean) =>
  q("insert into game_config (key, value) values ('rehearsal_mode', $1::jsonb) on conflict (key) do update set value = excluded.value", [
    JSON.stringify(on),
  ]);

async function stationWithHistory(code: string) {
  const id = Number((await q("insert into stations (code, name, day, status) values ($1, $2, 2, 'closed') returning id", [code, `Day 2 ${code}`]))[0].id);
  await q("insert into token_transactions (group_id, delta, station_id) values (1, -2, $1), (1, 5, $1)", [id]);
  await q("insert into token_logs (group_id, amount, station_id) values (1, -2, $1)", [id]);
  return id;
}

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "st-del-pg-"));
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port: PORT, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"] });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("st");
  admin = await connect();

  await admin.query(read("tests/stations/stub-schema.sql"));
  // What 0116 needs from the rest of the schema.
  await admin.query(`
    create table public.game_config (key text primary key, value jsonb not null);
    create function public.config_bool(p_key text, p_default boolean) returns boolean
      language sql stable security definer set search_path = public
      as $$ select coalesce((select (value #>> '{}')::boolean from public.game_config where key = p_key), p_default) $$;
    create function public.is_game_lead() returns boolean
      language sql stable security definer set search_path = public
      as $$ select coalesce(public.my_role() in ('hogm', 'admin'), false) $$;
    create table public.token_transactions (
      id bigserial primary key,
      group_id integer not null references public.groups (id),
      delta integer not null,
      station_id integer references public.stations (id)
    );
    create table public.token_logs (
      log_id uuid primary key default gen_random_uuid(),
      group_id integer not null references public.groups (id),
      amount integer not null,
      station_id integer references public.stations (id) on delete set null
    );
  `);
  await admin.query(read("supabase/migrations/0116_delete_station_with_history.sql"));

  await q("insert into groups (id, name) values (1, 'Group 1')");
  await q("insert into profiles (id, role, full_name) values ($1, 'admin', 'Admin'), ($2, 'hogm', 'HOGM'), ($3, 'gm', 'GM')", [ADMIN, HOGM, GM]);
}, 120_000);

afterAll(async () => {
  await admin?.end().catch(() => {});
  await pg?.stop().catch(() => {});
  try {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* left for the OS temp cleanup */
  }
});

describe("fn_delete_station_with_history", () => {
  it("a plain delete of a station with token_transactions fails (the original bug)", async () => {
    const id = await stationWithHistory("A1-2");
    expect(await fails(q("delete from stations where id=$1", [id]))).toMatch(/foreign key/i);
    await q("delete from token_transactions where station_id=$1", [id]);
    await q("delete from stations where id=$1", [id]);
    await q("delete from token_logs where station_id is null"); // set null by that delete
  });

  it("is refused outside Rehearsal mode", async () => {
    await rehearsal(false);
    const id = await stationWithHistory("A1-3");
    expect(await fails(rpc(HOGM, "fn_delete_station_with_history", [id]))).toMatch(/STATION_DELETE_LOCKED/);
    expect(await exists(id)).toBe(true);
  });

  it("is refused for a Game Master, even in Rehearsal mode", async () => {
    await rehearsal(true);
    const id = await stationWithHistory("A1-4");
    expect(await fails(rpc(GM, "fn_delete_station_with_history", [id]))).toMatch(/PERMISSION_DENIED/);
    expect(await exists(id)).toBe(true);
  });

  it("HOGM deletes it in Rehearsal mode; the token records stay without the station", async () => {
    await rehearsal(true);
    const id = await stationWithHistory("A1-5");
    const r = await rpc(HOGM, "fn_delete_station_with_history", [id]);
    expect(r).toMatchObject({ ok: true, transactions_detached: 2, logs_detached: 1 });
    expect(await exists(id)).toBe(false);
    // Only this station's two rows are detached (the others still point at their stations).
    const tx = await q("select delta from token_transactions where station_id is null order by delta");
    expect(tx.map((t) => Number(t.delta))).toEqual([-2, 5]);
    expect((await q("select count(*)::int as n from token_logs where station_id is null"))[0].n).toBe(1);
    const log = await q("select actor_role, action, target, detail from audit_log where action = 'station.delete' and target = $1", [`station:${id}`]);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actor_role: "hogm" });
    expect(log[0].detail).toMatchObject({ name: "Day 2 A1-5", transactions_detached: 2, logs_detached: 1 });
  });

  it("Admin can too, and an unknown station is reported", async () => {
    await rehearsal(true);
    const id = await stationWithHistory("A1-6");
    expect(await rpc(ADMIN, "fn_delete_station_with_history", [id])).toMatchObject({ ok: true });
    expect(await fails(rpc(ADMIN, "fn_delete_station_with_history", [id]))).toMatch(/STATION_NOT_FOUND/);
  });
});
