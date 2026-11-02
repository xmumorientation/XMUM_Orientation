import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const sql = (file: string) => readFileSync(path.join(root, file), "utf8");
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
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
  } catch (e) { await db.query("rollback"); throw e; }
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "oc-role-"));
  pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port: 55441, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C", "-c", "shared_memory_type=mmap", "-c", "dynamic_shared_memory_type=posix"] });
  await pg.initialise(); await pg.start();
  db = new Client({ host: "localhost", port: 55441, user: "postgres", password: "pw", database: "postgres" });
  await db.connect();
  await db.query(sql("tests/blindbox/stub-schema.sql"));
  for (const file of ["0054_blindbox_v3.sql", "0070_blindbox_buy_flow.sql", "0090_blindbox_qr_hardening.sql", "0091_blindbox_review_fixes.sql", "0100_blindbox_spot_no_stations.sql", "0103_staff_location_sharing.sql"]) {
    await db.query(sql(`supabase/migrations/${file}`));
  }
  await db.query(`
    create type public.projector_location as enum ('B1','A3','TF');
    create type public.station_status as enum ('available','in_progress','closed');
    alter table public.profiles add constraint profiles_role_allowed check(role in ('freshie','faci','gm','committee','hof','hogm','admin'));
    create table public.group_login_codes (group_id integer, password text);
    alter table public.group_login_codes enable row level security;
    create policy "ops reads group logins" on public.group_login_codes for select using (public.my_role() in ('hof','committee'));
    alter table public.audit_log enable row level security;
    create policy "leads read audit log" on public.audit_log for select using (public.my_role() in ('hof','hogm','admin'));
    create table public.faq_items (roles public.user_role[]);
    create table public.gacha_pools (allowed_roles public.user_role[]);
    insert into public.faq_items values ('{hof}'), ('{admin}');
    insert into public.gacha_pools values ('{hof,admin}');
    insert into public.group_login_codes values (1,'1234');
  `);
  // Install existing HOF operations helpers; migration patches only installed functions.
  await db.query(`
    create function public.is_faci_lead() returns boolean language sql stable security definer set search_path=public as
      $$ select coalesce(public.my_role() in ('hof','admin'),false) $$;
    create table public.role_permissions(role public.user_role, permission text, primary key(role,permission));
    insert into public.role_permissions values ('hof','operations.view'), ('admin','admin.only');
  `);
  await db.query(sql("supabase/migrations/0104_committee_read_only.sql"));
  await db.query(sql("supabase/migrations/0113_oc_role.sql"));
  // This fixture models blind boxes + staff positions; unrelated legacy tables are absent.
  await db.query("set check_function_bodies = off");
  await db.query(sql("supabase/migrations/0114_oc_hof_permissions.sql"));
  await db.query("set check_function_bodies = on");
  for (const [n, role] of [[1,"admin"],[2,"oc"],[3,"oc"],[4,"freshie"],[5,"hof"],[6,"committee"]]) {
    await db.query("insert into profiles(id, role, full_name) values ($1,$2::user_role,$3)", [uid(Number(n)), role, role]);
  }
  await db.query("insert into groups(id,name,token_balance) values (1,'Group 1',100)");
  await db.query("update profiles set group_id=1 where id=$1", [uid(4)]);
  await db.query("insert into game_config values ('blind_box_enabled','true'), ('tokens_frozen','false'), ('blind_box_cap','10') on conflict (key) do update set value=excluded.value");
});
afterAll(async () => { await db?.end(); await pg?.stop(); if (dir) rmSync(dir, { recursive: true, force: true }); });

it("keeps the OC identity while granting HOF operations access", async () => {
  for (const n of [2,5]) {
    expect(await asUser(n, "select is_committee() as crew, is_faci_lead() as lead, is_admin() as admin")).toEqual([{crew:true,lead:true,admin:false}]);
    expect(await asUser(n, "select * from group_login_codes")).toHaveLength(1);
  }
  expect(await asUser(2, "select my_role()::text as role")).toEqual([{role:"oc"}]);
  expect(await asUser(6, "select is_faci_lead() as lead")).toEqual([{lead:false}]);
  await expect(asUser(6, "update groups set name=name where id=1")).rejects.toThrow("COMMITTEE_READ_ONLY");
  expect((await db.query("select to_regprocedure('public.fn_adjust_tokens(integer,integer,text,text)') as removed")).rows[0].removed).toBeNull();
});
it("supports Admin assignment by OC role, own seller RLS and Freshie purchases", async () => {
  const type = (await db.query("insert into blind_box_types(name,min_tokens,max_tokens,price,stock) values ('OC box',5,5,2,10) returning id")).rows[0].id;
  await asUser(1, "select fn_bb_assign($1,2,'oc',null)", [type]);
  const own = await asUser(2, "select * from blind_box_assignments");
  expect(own).toHaveLength(1);
  expect(own[0].profile_id).toBe(uid(2));
  expect(await asUser(3, "select * from blind_box_assignments")).toHaveLength(1);
  const seller = (await db.query("select * from blind_box_sellers where profile_id=$1", [uid(2)])).rows[0];
  const bought = await asUser(4, "select fn_bb_buy($1,$2,$3,'oc-buy') as result", [seller.id,seller.qr_version,own[0].id]);
  expect(bought[0].result.ok).toBe(true);
  expect(bought[0].result.seller_name).toBe("oc");
  await expect(asUser(2, "select fn_bb_assign($1,1,'oc',null)", [type])).rejects.toThrow();
});
it("shows an OC staff pin with its real role and preserves audit attribution", async () => {
  await asUser(2, "select fn_staff_location_share(true)");
  await asUser(2, "select fn_report_staff_gps(2.8,101.7,10)");
  const pins = await asUser(5, "select * from fn_staff_positions()");
  expect(pins).toHaveLength(1);
  expect(pins[0].role).toBe("oc");
  await asUser(2, "select audit('oc.test','oc','{}')");
  expect((await asUser(2, "select actor_role::text as role from audit_log where action='oc.test'"))[0]).toEqual({role:"oc"});
});
it("inherits HOF content and can reapply permissions without duplicates", async () => {
  await db.query("set check_function_bodies = off");
  await db.query(sql("supabase/migrations/0114_oc_hof_permissions.sql"));
  await db.query("set check_function_bodies = on");
  expect((await db.query("select roles::text from faq_items order by cardinality(roles)")).rows).toEqual([{roles:"{admin}"},{roles:"{hof,oc}"}]);
  expect((await db.query("select permission from role_permissions where role='oc'" )).rows).toEqual([{permission:"operations.view"}]);
});
