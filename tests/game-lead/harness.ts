// Shared setup for the game-lead database tests (migrations 0071 / 0072 / 0097).
// A real Postgres runs in a temp folder (embedded-postgres) on the blind-box
// stub schema, plus the few tables these functions touch.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";

const ROOT = path.resolve(__dirname, "../..");
export const sql = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
export const ADMIN = uid(1);
export const HOGM = uid(2);
export const HOF = uid(3);
export const COMMITTEE = uid(4);
export const GM = uid(5);

export type Row = Record<string, unknown>;

export async function fails(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** One `create or replace function public.<fn>(…) … $$;` block from a migration file. */
function fnFrom(file: string, fn: string): string {
  const text = sql(`supabase/migrations/${file}`);
  const start = text.indexOf(`create or replace function public.${fn}(`);
  if (start < 0) throw new Error(`${fn} not in ${file}`);
  const end = text.indexOf("\n$$;", start);
  return text.slice(start, end + 4);
}

/** The functions 0071 patches, as this repo's migrations define them. */
const ORIGINALS: [string, string][] = [
  ["0003_functions.sql", "fn_phase_control"],
  ["0003_functions.sql", "fn_set_config"],
  ["0046_token_rules.sql", "fn_update_game_config_rule"],
  ["0056_token_reset.sql", "fn_reset_tokens_and_puzzles"],
  ["0065_gm_station_per_day_and_headcount.sql", "fn_admin_station_gms"],
  ["0066_station_gms_set.sql", "fn_admin_set_station_gms"],
];

const SCHEMA = `
  alter table public.groups add column current_tokens integer not null default 0;
  alter table public.stations add column day integer not null default 1,
    add column status text not null default 'closed', add column area text;
  alter table public.game_config add column updated_by uuid, add column updated_at timestamptz default now();
  create table public.phases (id serial primary key, key text unique, name text, duration_minutes integer,
    state text not null default 'pending', started_at timestamptz, ends_at timestamptz, paused_remaining integer,
    -- bonding-session 0032 columns (unused by the repo's own fn_phase_control)
    paused_at timestamptz, updated_by uuid, updated_at timestamptz not null default now(), version bigint not null default 1);
  create table public.session_control_log (log_id bigserial primary key, phase_id integer, phase_key text, action text,
    previous_state text, new_state text, seconds_changed integer, actor_user_id uuid, created_at timestamptz default now());
  create table public.game_config_rules (rule_key varchar(100) primary key, rule_value integer, updated_at timestamptz);
  create table public.gm_station_assignments (user_id uuid, day integer, station_id integer,
    created_by uuid, updated_by uuid, primary key (user_id, day));
  create table public.token_logs (log_id serial primary key);
  create table public.puzzle_inventory (id serial primary key);
  create table public.nfc_tokens (id serial primary key, label text);
  create schema storage;
  create table storage.objects (id serial primary key, bucket_id text, name text);
  grant usage on schema storage to authenticated;
  grant all on all tables in schema public, storage to authenticated;
  grant all on all sequences in schema public, storage to authenticated;
  alter table public.phases enable row level security;
  alter table public.stations enable row level security;
  alter table public.nfc_tokens enable row level security;
  alter table storage.objects enable row level security;
  create policy "all read phases" on public.phases for select using (auth.uid() is not null);
  create policy "admin manages phases" on public.phases for all using (public.is_admin()) with check (public.is_admin());
  create policy "all read stations" on public.stations for select using (auth.uid() is not null);
  create policy "admin manages stations" on public.stations for all using (public.is_admin()) with check (public.is_admin());
  create policy "admin reads nfc tokens" on public.nfc_tokens for select using (public.is_admin());
  create policy "public read puzzle images" on storage.objects for select using (bucket_id = 'puzzle-images');
  create policy "admin writes puzzle images" on storage.objects for insert with check (bucket_id = 'puzzle-images' and public.is_admin());
`;

/**
 * Starts a database with 0071, 0072 and 0097 applied. `phaseControl` replaces the
 * repo's fn_phase_control (e.g. the live database's bonding-session one).
 */
export async function startDb(port: number, phaseControl?: string) {
  const dataDir = mkdtempSync(path.join(tmpdir(), "gl-pg-"));
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"] });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("gl");

  const connect = async () => {
    const c = new Client({ host: "localhost", port, user: "postgres", password: "pw", database: "gl" });
    await c.connect();
    return c;
  };
  const db = await connect();
  const q = async <T extends Row = Row>(text: string, params: unknown[] = []) => (await db.query(text, params)).rows as T[];

  /** Runs one statement as `user` (role authenticated, RLS on) in its own transaction. */
  const as = async <T extends Row = Row>(user: string, text: string, params: unknown[] = []): Promise<T[]> => {
    const c = await connect();
    try {
      await c.query("begin");
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
      const r = await c.query(text, params);
      await c.query("commit");
      return r.rows as T[];
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    } finally {
      await c.end();
    }
  };

  await db.query(sql("tests/blindbox/stub-schema.sql"));
  await db.query(SCHEMA);
  for (const [file, fn] of ORIGINALS) {
    await db.query(fn === "fn_phase_control" && phaseControl ? phaseControl : fnFrom(file, fn));
  }
  await db.query(sql("supabase/migrations/0071_hogm_game_control.sql"));
  await db.query(sql("supabase/migrations/0072_hogm_game_length.sql"));
  await db.query(sql("supabase/migrations/0097_projector_places.sql"));

  for (const [id, role] of [
    [ADMIN, "admin"],
    [HOGM, "hogm"],
    [HOF, "hof"],
    [COMMITTEE, "committee"],
    [GM, "gm"],
  ]) {
    await q("insert into profiles (id, role, full_name) values ($1, $2::user_role, $3)", [id, role, role]);
  }

  const stop = async () => {
    await db.end();
    await pg.stop();
    rmSync(dataDir, { recursive: true, force: true });
  };
  return { db, q, as, stop };
}
