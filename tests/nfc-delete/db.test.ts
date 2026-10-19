import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migration = readFileSync(path.resolve(__dirname, "../../supabase/migrations/0086_nfc_token_delete.sql"), "utf8");
const port = 54336;
let postgres: EmbeddedPostgres;
let directory: string;
let db: Client;

async function connect() {
  const client = new Client({ host: "localhost", port, user: "postgres", password: "pw", database: "nfc_delete" });
  await client.connect();
  return client;
}

async function remove(id: number, role = "admin") {
  const client = await connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('test.role', $1, true)", [role]);
    const result = await client.query("select public.fn_admin_delete_nfc_token($1) result", [id]);
    await client.query("commit");
    return result.rows[0].result;
  } finally {
    await client.query("rollback");
    await client.end();
  }
}

async function card() {
  return (await db.query("insert into nfc_tokens (token_hash, label, location) values (gen_random_uuid()::text, 'Spare card', 'B1') returning id")).rows[0].id as number;
}

async function exists(id: number) {
  return (await db.query("select exists(select 1 from nfc_tokens where id = $1) present", [id])).rows[0].present;
}

beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "nfc-delete-"));
  postgres = new EmbeddedPostgres({ databaseDir: directory, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"] });
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase("nfc_delete");
  db = await connect();
  await db.query(`
    create role anon;
    create role authenticated;
    create type projector_location as enum ('B1', 'A3', 'TF');
    create table nfc_tokens (
      id serial primary key, token_hash text not null unique,
      label text not null default '', location projector_location not null,
      used_at timestamptz, used_by_group integer, created_by uuid,
      created_at timestamptz not null default now()
    );
    create table projectors (location projector_location primary key, activated_at timestamptz);
    create table audit_log (id serial primary key, action text, target text, detail jsonb);
    create function is_admin() returns boolean language sql as
      $$ select nullif(current_setting('test.role', true), '') = 'admin' $$;
    create function audit(text, text, jsonb) returns void language sql as
      $$ insert into audit_log(action, target, detail) values ($1, $2, $3) $$;
  `);
  await db.query(migration);
}, 120_000);

afterAll(async () => {
  await db?.end();
  await postgres?.stop();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe("base schema", () => {
  it("deletes an unused card and audits only its non-secret identity", async () => {
    const id = await card();
    expect(await remove(id)).toEqual({ ok: true, already_deleted: false });
    expect(await exists(id)).toBe(false);
    const audit = (await db.query("select action, target, detail from audit_log where target = $1", [`nfc:${id}`])).rows;
    expect(audit).toEqual([{ action: "nfc.delete", target: `nfc:${id}`, detail: { token_id: id, label: "Spare card", location: "B1", log_ids: [] } }]);
    expect(await remove(id)).toEqual({ ok: true, already_deleted: true });
    expect((await db.query("select count(*)::int n from audit_log where target = $1", [`nfc:${id}`])).rows[0].n).toBe(1);
  });

  it.each(["hogm", "hof", "committee", "gm", "guardian_gm", "faci", "freshie", ""])("rejects role %s without changing the card", async (role) => {
    const id = await card();
    await expect(remove(id, role)).rejects.toThrow("PERMISSION_DENIED");
    expect(await exists(id)).toBe(true);
  });

  it("denies anon execution", async () => {
    const client = await connect();
    try {
      await client.query("set role anon");
      await expect(client.query("select fn_admin_delete_nfc_token(1)")).rejects.toThrow("permission denied");
    } finally { await client.end(); }
  });

  it.each(["used_at = now()", "used_by_group = 1"])("protects cards with %s", async (assignment) => {
    const id = await card();
    await db.query(`update nfc_tokens set ${assignment} where id = $1`, [id]);
    await expect(remove(id)).rejects.toThrow("NFC_TOKEN_USED");
    expect(await exists(id)).toBe(true);
  });
});

describe("enriched live schema", () => {
  beforeAll(async () => {
    await db.query(`
      alter table nfc_tokens add column status text default 'UNUSED';
      alter table nfc_tokens add column used_by_user uuid;
      alter table projectors add column activated_by_nfc_id integer references nfc_tokens(id);
      create table nfc_logs (log_id serial primary key, nfc_id integer references nfc_tokens(id), result text);
      create table nfc_guardian_verifications (id serial primary key, consumed_by_nfc_id integer references nfc_tokens(id));
      create table nfc_puzzle_requirements (id serial primary key, nfc_id integer references nfc_tokens(id) on delete cascade);
    `);
    await db.query(migration);
  });

  it("protects status-only used cards", async () => {
    const id = await card();
    await db.query("update nfc_tokens set status = 'USED' where id = $1", [id]);
    await expect(remove(id)).rejects.toThrow("NFC_TOKEN_USED");
    expect(await exists(id)).toBe(true);
  });

  it("protects cards consumed by a user even without a timestamp", async () => {
    const id = await card();
    await db.query("update nfc_tokens set used_by_user = gen_random_uuid() where id = $1", [id]);
    await expect(remove(id)).rejects.toThrow("NFC_TOKEN_USED");
    expect(await exists(id)).toBe(true);
  });

  it("protects projector links even without an activation timestamp", async () => {
    const id = await card();
    await db.query("insert into projectors(location, activated_by_nfc_id) values ('B1', $1)", [id]);
    await expect(remove(id)).rejects.toThrow("NFC_TOKEN_PROJECTOR_LINKED");
    expect(await exists(id)).toBe(true);
  });

  it("keeps consumed Guardian verification links", async () => {
    const id = await card();
    await db.query("insert into nfc_guardian_verifications(consumed_by_nfc_id) values ($1)", [id]);
    await expect(remove(id)).rejects.toThrow("NFC_TOKEN_GUARDIAN_LINKED");
    expect((await db.query("select consumed_by_nfc_id from nfc_guardian_verifications where consumed_by_nfc_id = $1", [id])).rows).toEqual([{ consumed_by_nfc_id: id }]);
    expect(await exists(id)).toBe(true);
  });

  it("keeps logs and their audited identity while cascading unused requirements", async () => {
    const id = await card();
    const log = (await db.query("insert into nfc_logs(nfc_id, result) values ($1, 'WRONG_PHASE') returning log_id", [id])).rows[0].log_id;
    await db.query("insert into nfc_puzzle_requirements(nfc_id) values ($1)", [id]);
    expect(await remove(id)).toEqual({ ok: true, already_deleted: false });
    expect(await exists(id)).toBe(false);
    expect((await db.query("select nfc_id, result from nfc_logs where log_id = $1", [log])).rows).toEqual([{ nfc_id: null, result: "WRONG_PHASE" }]);
    expect((await db.query("select detail from audit_log where target = $1", [`nfc:${id}`])).rows[0].detail).toEqual({ token_id: id, label: "Spare card", location: "B1", log_ids: [log] });
    expect((await db.query("select count(*)::int n from nfc_puzzle_requirements where nfc_id = $1", [id])).rows[0].n).toBe(0);
  });

  it("rolls back card, logs and requirements when audit fails", async () => {
    const id = await card();
    await db.query("insert into nfc_logs(nfc_id, result) values ($1, 'WRONG_PHASE')", [id]);
    await db.query("insert into nfc_puzzle_requirements(nfc_id) values ($1)", [id]);
    await db.query("alter table audit_log add constraint fail_delete check (action <> 'nfc.delete') not valid");
    try {
      await expect(remove(id)).rejects.toThrow("fail_delete");
      expect(await exists(id)).toBe(true);
      expect((await db.query("select nfc_id from nfc_logs where nfc_id = $1", [id])).rows).toEqual([{ nfc_id: id }]);
      expect((await db.query("select nfc_id from nfc_puzzle_requirements where nfc_id = $1", [id])).rows).toEqual([{ nfc_id: id }]);
    } finally { await db.query("alter table audit_log drop constraint fail_delete"); }
  });

  it("waits for activation's token lock and rejects the committed consumption", async () => {
    const id = await card();
    const activation = await connect();
    let deletion: Promise<unknown> | undefined;
    try {
      await activation.query("begin");
      await activation.query("select id from nfc_tokens where id = $1 for update", [id]);
      deletion = remove(id).catch((error: Error) => error.message);
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const result = await db.query("select exists(select 1 from pg_stat_activity where wait_event_type = 'Lock' and query like 'select public.fn_admin_delete_nfc_token%') waiting");
        if (result.rows[0].waiting) { waiting = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await activation.query("update nfc_tokens set used_at = now(), used_by_group = 1 where id = $1", [id]);
      await activation.query("commit");
      expect(await deletion).toBe("NFC_TOKEN_USED");
      expect(await exists(id)).toBe(true);
    } finally {
      await activation.query("rollback");
      await activation.end();
      await deletion;
    }
  });
});
