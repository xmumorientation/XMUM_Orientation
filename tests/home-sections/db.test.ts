import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

// Migration 0117 on a minimal stand-in for Supabase: who can read, add, change
// and remove home sections and their files, and that the action plans are seeded.

const root = path.resolve(__dirname, "../..");
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ROLES = ["freshie", "faci", "gm", "guardian_gm", "hof", "oc", "hogm", "committee", "admin"] as const;
const USER = Object.fromEntries(ROLES.map((r, i) => [r, i + 1])) as Record<(typeof ROLES)[number], number>;
let pg: EmbeddedPostgres;
let db: Client;
let dir: string;

async function asUser(n: number, query: string, args: unknown[] = []) {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid(n)]);
    const result = await db.query(query, args);
    await db.query("commit");
    return result.rows;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}
const asRole = (role: (typeof ROLES)[number], query: string, args: unknown[] = []) => asUser(USER[role], query, args);

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "home-sections-"));
  pg = new EmbeddedPostgres({
    databaseDir: dir, user: "postgres", password: "pw", port: 55460, persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C", "-c", "shared_memory_type=mmap", "-c", "dynamic_shared_memory_type=posix"],
  });
  await pg.initialise();
  await pg.start();
  db = new Client({ host: "localhost", port: 55460, user: "postgres", password: "pw", database: "postgres" });
  await db.connect();
  await db.query(`
    create schema auth;
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public, auth to anon, authenticated;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create type public.user_role as enum (${ROLES.map((r) => `'${r}'`).join(",")});
    create table public.profiles (id uuid primary key, role public.user_role not null);
    grant select on public.profiles to authenticated;
    create function public.my_role() returns public.user_role language sql stable security definer
      set search_path = public as $$ select role from public.profiles where id = auth.uid() $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
  `);
  for (const r of ROLES) await db.query("insert into public.profiles values ($1, $2)", [uid(USER[r]), r]);
  await db.query(readFileSync(path.join(root, "supabase/migrations/0117_home_sections.sql"), "utf8"));
  await db.query("grant select, insert, update, delete on public.home_sections to authenticated");
}, 120_000);

afterAll(async () => {
  await db?.end();
  await pg?.stop();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const add = (title: string, roles: string[], path = `f/${title}.pdf`) =>
  asRole("hof", "insert into public.home_sections (title, storage_path, file_kind, roles) values ($1, $2, 'pdf', $3::public.user_role[]) returning id", [title, path, roles]);

it("seeds both action plans for every role except Freshie", async () => {
  const rows = await asRole("admin", "select title, file_url, roles from public.home_sections order by sort_order");
  expect(rows.map((r) => r.title)).toEqual(["Day 1 Action Plan", "Day 2 Action Plan"]);
  expect(rows[0].file_url).toBe("/action-plans/day-1.png");
  expect(rows[0].roles).not.toContain("freshie");
  expect(rows[0].roles).toContain("faci");
  // re-running the migration adds nothing
  await db.query(readFileSync(path.join(root, "supabase/migrations/0117_home_sections.sql"), "utf8"));
  expect((await db.query("select count(*)::int n from public.home_sections")).rows[0].n).toBe(2);
});

it("lets HOF, OC, HOGM and Admin add, change and remove a section", async () => {
  for (const role of ["hof", "oc", "hogm", "admin"] as const) {
    const [row] = await asRole(role, "insert into public.home_sections (title, storage_path, file_kind, roles) values ($1, $2, 'pdf', '{faci}') returning id", [`By ${role}`, `f/${role}.pdf`]);
    await asRole(role, "update public.home_sections set title = 'Renamed' where id = $1", [row.id]);
    await asRole(role, "delete from public.home_sections where id = $1", [row.id]);
  }
  expect((await db.query("select count(*)::int n from public.home_sections where title in ('Renamed')")).rows[0].n).toBe(0);
});

it("refuses everyone else, Committee included", async () => {
  for (const role of ["freshie", "faci", "gm", "guardian_gm", "committee"] as const) {
    await expect(asRole(role, "insert into public.home_sections (title, storage_path, file_kind, roles) values ('Nope', 'x', 'pdf', '{faci}')")).rejects.toThrow();
    // a delete or update by a non-editor touches no rows (RLS hides them)
    await asRole(role, "update public.home_sections set title = 'Hacked'");
    await asRole(role, "delete from public.home_sections");
  }
  expect((await db.query("select count(*)::int n from public.home_sections where title = 'Hacked'")).rows[0].n).toBe(0);
  expect((await db.query("select count(*)::int n from public.home_sections where title in ('Day 1 Action Plan','Day 2 Action Plan')")).rows[0].n).toBe(2);
});

it("shows a role only the sections that list it; editors see all", async () => {
  await add("Faci Only", ["faci"], "f/faci-only.pdf");
  await add("Freshie Only", ["freshie"], "f/freshie-only.pdf");
  const titles = async (role: (typeof ROLES)[number]) => (await asRole(role, "select title from public.home_sections order by title")).map((r) => r.title);
  expect(await titles("faci")).toContain("Faci Only");
  expect(await titles("faci")).not.toContain("Freshie Only");
  expect(await titles("freshie")).toEqual(["Freshie Only"]);
  expect(await titles("gm")).not.toContain("Faci Only");
  expect(await titles("hogm")).toEqual(expect.arrayContaining(["Faci Only", "Freshie Only"]));
});

it("rejects a section with no roles, no title, or both file sources", async () => {
  const bad = (sql: string) => expect(asRole("hof", sql)).rejects.toThrow();
  await bad("insert into public.home_sections (title, storage_path, file_kind, roles) values ('x', 'a', 'pdf', '{}')");
  await bad("insert into public.home_sections (title, storage_path, file_kind, roles) values ('  ', 'a', 'pdf', '{faci}')");
  await bad("insert into public.home_sections (title, storage_path, file_url, file_kind, roles) values ('x', 'a', '/b', 'pdf', '{faci}')");
  await bad("insert into public.home_sections (title, file_kind, roles) values ('x', 'pdf', '{faci}')");
  await bad("insert into public.home_sections (title, storage_path, file_kind, roles) values ('x', 'a', 'doc', '{faci}')");
});

it("protects the files the same way", async () => {
  await db.query("insert into storage.objects (bucket_id, name) values ('home-files', 'f/faci-only.pdf'), ('home-files', 'f/orphan.pdf'), ('other', 'f/other.pdf')");
  const names = async (role: (typeof ROLES)[number]) => (await asRole(role, "select name from storage.objects order by name")).map((r) => r.name);
  expect(await names("faci")).toEqual(["f/faci-only.pdf"]);
  expect(await names("freshie")).toEqual([]);
  expect(await names("hof")).toEqual(expect.arrayContaining(["f/faci-only.pdf", "f/orphan.pdf"]));
  await asRole("hogm", "insert into storage.objects (bucket_id, name) values ('home-files', 'f/new.pdf')");
  await expect(asRole("faci", "insert into storage.objects (bucket_id, name) values ('home-files', 'f/x.pdf')")).rejects.toThrow();
  await expect(asRole("committee", "insert into storage.objects (bucket_id, name) values ('home-files', 'f/y.pdf')")).rejects.toThrow();
});

it("makes the bucket private, 10 MB, PDF and images only", async () => {
  const [b] = (await db.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'home-files'")).rows;
  expect(b.public).toBe(false);
  expect(Number(b.file_size_limit)).toBe(10 * 1024 * 1024);
  expect(b.allowed_mime_types).toEqual(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"]);
});
