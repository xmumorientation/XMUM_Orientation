import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migration = readFileSync(path.resolve(__dirname, "../supabase/migrations/0104_committee_read_only.sql"), "utf8");
const dir = mkdtempSync(path.join(tmpdir(), "committee-read-only-"));
const db = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "test", port: 55439, persistent: false });
let client: Client;

beforeAll(async () => {
  await db.initialise();
  await db.start();
  client = new Client({ host: "localhost", port: 55439, user: "postgres", password: "test", database: "postgres" });
  await client.connect();
  await client.query(`
    create role anon; create role authenticated;
    create function public.my_role() returns text language sql stable as
      $$ select nullif(current_setting('test.role', true), '') $$;
    create table public.groups (id integer primary key, name text);
    create table public.profiles (id integer primary key, group_id integer);
    create table public.audit_log (action text);
    alter table public.audit_log enable row level security;
    grant usage on schema public to authenticated;
    grant all on all tables in schema public to authenticated;
    insert into public.groups values (1, 'Group 1');
    insert into public.profiles values (1, 1);
    insert into public.audit_log values ('group.updated');
    create function public.legacy_assign() returns void language plpgsql security definer as
      $$ begin update public.profiles set group_id = 2 where id = 1; end $$;
  `);
  await client.query(migration);
  await client.query("set role authenticated; set test.role = 'committee'");
});
afterAll(async () => {
  await client?.end();
  await db.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe("general Committee read-only database access", () => {
  it("can read groups, Facilitator assignments and HOF's audit history", async () => {
    expect((await client.query("select * from public.groups")).rows).toHaveLength(1);
    expect((await client.query("select * from public.profiles")).rows).toHaveLength(1);
    expect((await client.query("select * from public.audit_log")).rows).toHaveLength(1);
  });
  it.each([
    "insert into public.groups values (2, 'Changed')",
    "update public.groups set name = 'Changed' where id = 1",
    "delete from public.groups where id = 1",
    "truncate public.groups",
    "select public.legacy_assign()",
  ])("blocks a direct or privileged legacy write: %s", async (query) => {
    await expect(client.query(query)).rejects.toThrow("COMMITTEE_READ_ONLY");
    expect((await client.query("select name from public.groups where id = 1")).rows[0].name).toBe("Group 1");
    expect((await client.query("select group_id from public.profiles where id = 1")).rows[0].group_id).toBe(1);
  });
  it.each(["hof", "admin"])("preserves existing %s writes", async (role) => {
    await client.query("select set_config('test.role', $1, false)", [role]);
    await expect(client.query("update public.groups set name = name where id = 1")).resolves.toMatchObject({rowCount:1});
    await client.query("set test.role = 'committee'");
  });
  it("can reapply the migration without duplicate triggers or policies", async () => {
    await client.query("reset role; set test.role = 'admin'");
    await client.query(migration);
    await client.query("set role authenticated; set test.role = 'committee'");
    await expect(client.query("select public.legacy_assign() ")).rejects.toThrow("COMMITTEE_READ_ONLY");
  });
});
