import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migration = readFileSync(path.resolve(__dirname, "../../supabase/migrations/0123_reset_nfc_test_mode.sql"), "utf8");
const port = 54337;
let postgres: EmbeddedPostgres;
let directory: string;
let db: Client;

async function connect() {
  const client = new Client({ host: "localhost", port, user: "postgres", password: "pw", database: "nfc_test_reset" });
  await client.connect();
  return client;
}

async function reset(role = "admin") {
  const client = await connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('test.role', $1, true)", [role]);
    const result = await client.query("select public.fn_admin_reset_nfc_test_mode() result");
    await client.query("commit");
    return result.rows[0].result;
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end();
  }
}

async function clearAll(role = "admin") {
  const client = await connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('test.role', $1, true)", [role]);
    const result = await client.query("select public.fn_admin_clear_nfc_stickers() result");
    await client.query("commit");
    return result.rows[0].result;
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end();
  }
}

beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "nfc-test-reset-"));
  postgres = new EmbeddedPostgres({ databaseDir: directory, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"] });
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase("nfc_test_reset");
  db = await connect();
  await db.query(`
    create role anon;
    create role authenticated;
    create type projector_location as enum ('B1', 'A3', 'TF');
    create table groups (id integer primary key);
    create table profiles (id uuid primary key);
    create table nfc_test_runs (id uuid primary key, group_id integer references groups(id), location projector_location, created_by uuid references profiles(id));
    create table nfc_tokens (id serial primary key, token_hash text, label text, location projector_location, test_run_id uuid references nfc_test_runs(id));
    create table puzzle_redemptions (id serial primary key, group_id integer, location projector_location, test_run_id uuid references nfc_test_runs(id));
    create table projectors (location projector_location primary key, activated_by_group integer, activated_at timestamptz, activated_manually boolean default false, test_run_id uuid references nfc_test_runs(id), activated_by_nfc_id integer references nfc_tokens(id));
    create table nfc_logs (id serial primary key, nfc_id integer references nfc_tokens(id));
    create table nfc_guardian_verifications (id serial primary key, consumed_by_nfc_id integer references nfc_tokens(id));
    create table audit_log (id serial primary key, action text, target text, detail jsonb);
    create function is_admin() returns boolean language sql as $$ select nullif(current_setting('test.role', true), '') = 'admin' $$;
    create function audit(text, text, jsonb) returns void language sql as $$ insert into audit_log(action, target, detail) values ($1, $2, $3) $$;
    insert into groups values (1), (2);
    insert into profiles values ('00000000-0000-0000-0000-000000000001');
  `);
  await db.query(migration);
}, 120_000);

afterAll(async () => {
  await db?.end();
  await postgres?.stop();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe("fn_admin_reset_nfc_test_mode", () => {
  it("removes only test data and clears its active state", async () => {
    const run = "00000000-0000-0000-0000-000000000010";
    await db.query("insert into nfc_test_runs values ($1, 1, 'B1', '00000000-0000-0000-0000-000000000001')", [run]);
    const testToken = (await db.query("insert into nfc_tokens(token_hash, label, location, test_run_id) values ('test', 'Test', 'B1', $1) returning id", [run])).rows[0].id;
    const productionToken = (await db.query("insert into nfc_tokens(token_hash, label, location) values ('production', 'Production', 'A3') returning id")).rows[0].id;
    await db.query("insert into puzzle_redemptions(group_id, location, test_run_id) values (1, 'B1', $1), (2, 'A3', null)", [run]);
    await db.query("insert into projectors(location, activated_by_group, activated_at, activated_manually, test_run_id, activated_by_nfc_id) values ('B1', 1, now(), true, $1, $2), ('A3', 2, now(), true, null, $3)", [run, testToken, productionToken]);
    await db.query("insert into nfc_logs(nfc_id) values ($1)", [testToken]);
    await db.query("insert into nfc_guardian_verifications(consumed_by_nfc_id) values ($1)", [testToken]);

    expect(await reset()).toEqual({ ok: true, stickers_deleted: 1, runs_deleted: 1 });
    expect((await db.query("select count(*)::int n from nfc_test_runs")).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int n from nfc_tokens where id = $1", [testToken])).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int n from nfc_tokens where id = $1", [productionToken])).rows[0].n).toBe(1);
    expect((await db.query("select activated_at, test_run_id, activated_by_nfc_id from projectors where location = 'B1'")).rows[0]).toEqual({ activated_at: null, test_run_id: null, activated_by_nfc_id: null });
    expect((await db.query("select count(*)::int n from puzzle_redemptions")).rows[0].n).toBe(1);
    expect((await db.query("select nfc_id from nfc_logs")).rows[0].nfc_id).toBeNull();
    expect((await db.query("select consumed_by_nfc_id from nfc_guardian_verifications")).rows[0].consumed_by_nfc_id).toBeNull();
  });

  it("requires an admin", async () => {
    await expect(reset("hogm")).rejects.toThrow("PERMISSION_DENIED");
  });

  it("clears every sticker while preserving non-test puzzle progress", async () => {
    const run = "00000000-0000-0000-0000-000000000020";
    await db.query("insert into nfc_test_runs values ($1, 1, 'TF', '00000000-0000-0000-0000-000000000001')", [run]);
    const testToken = (await db.query("insert into nfc_tokens(token_hash, label, location, test_run_id) values ('test-all', 'Test all', 'TF', $1) returning id", [run])).rows[0].id;
    const usedToken = (await db.query("insert into nfc_tokens(token_hash, label, location) values ('used-all', 'Used', 'B1') returning id")).rows[0].id;
    await db.query("insert into puzzle_redemptions(group_id, location, test_run_id) values (1, 'TF', $1), (2, 'A3', null)", [run]);
    await db.query("insert into projectors(location, activated_by_group, activated_at, activated_manually, test_run_id, activated_by_nfc_id) values ('TF', 1, now(), true, $1, $2)", [run, testToken]);
    await db.query("update projectors set activated_by_group = 2, activated_at = now(), activated_manually = true, activated_by_nfc_id = $1 where location = 'B1'", [usedToken]);

    expect(await clearAll()).toEqual({ ok: true, stickers_deleted: 3, test_runs_deleted: 1 });
    expect((await db.query("select count(*)::int n from nfc_tokens")).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int n from nfc_test_runs")).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int n from puzzle_redemptions")).rows[0].n).toBe(2);
    expect((await db.query("select count(*)::int n from projectors where activated_at is not null")).rows[0].n).toBe(0);
  });

  it("does not let non-admins clear all stickers", async () => {
    await expect(clearAll("hogm")).rejects.toThrow("PERMISSION_DENIED");
  });
});
