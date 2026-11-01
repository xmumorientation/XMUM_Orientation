// Admin → Token: editing or deleting a transaction (migration 0109).
// Real Postgres (embedded-postgres) on the game-lead harness. The balance, the
// log row and the audit row change together, only Admin can do it, and a change
// that would leave a negative balance changes nothing.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ADMIN, fails, HOGM, sql, startDb } from "../game-lead/harness";

let env: Awaited<ReturnType<typeof startDb>>;
const q: typeof env.q = (...a) => env.q(...a);
const as: typeof env.as = (...a) => env.as(...a);

const LOG = "00000000-0000-0000-0000-0000000000a1";
const LOG2 = "00000000-0000-0000-0000-0000000000a2";
const balance = async (id: number) => Number((await q("select token_balance from groups where id = $1", [id]))[0].token_balance);
const audits = (action: string) => q("select * from audit_log where action = $1 order by id", [action]);

beforeAll(async () => {
  env = await startDb(54340);
  // The harness stubs token_logs with its key only; use the real columns (0012, 0093).
  await q("drop table public.token_logs");
  await q(`create table public.token_logs (
    log_id uuid primary key default gen_random_uuid(),
    group_id integer not null references public.groups (id) on delete cascade,
    amount integer not null,
    transaction_type varchar(50) not null check (transaction_type in
      ('DAY1_GAME', 'DAY2_ENTRY', 'MANUAL_GM_ADJUST', 'MANUAL_ADMIN_ADJUST', 'SYSTEM_RESET', 'TOKEN_REVERSAL')),
    station_id integer, notes text, created_at timestamptz not null default now())`);
  await q("grant all on public.token_logs to authenticated");
  await q(sql("supabase/migrations/0109_admin_token_log_audit.sql"));
  await q("insert into groups (id, name) values (1, 'Group 1'), (2, 'Group 2')");
}, 180_000);

afterAll(async () => {
  await env?.stop();
});

async function seed() {
  await q("delete from token_logs");
  await q("delete from audit_log");
  await q("update groups set token_balance = 10 where id = 1");
  await q("update groups set token_balance = 3 where id = 2");
  await q("insert into token_logs (log_id, group_id, amount, transaction_type, notes) values ($1, 1, 5, 'DAY1_GAME', 'win')", [LOG]);
  await q("insert into token_logs (log_id, group_id, amount, transaction_type, notes) values ($1, 2, 2, 'TOKEN_REVERSAL', 'undo')", [LOG2]);
}

describe("fn_admin_update_token_log", () => {
  it("changes the log row and the balance, and audits it", async () => {
    await seed();
    await as(ADMIN, "select public.fn_admin_update_token_log($1, 1, 8, 'fixed', 'DAY1_GAME')", [LOG]);
    expect(await balance(1)).toBe(13);
    const row = (await q("select amount, notes from token_logs where log_id = $1", [LOG]))[0];
    expect(row).toMatchObject({ amount: 8, notes: "fixed" });
    const [a] = await audits("tokens.log_edit");
    expect(a.target).toBe("group:1");
    expect(a.actor).toBe(ADMIN);
    expect(a.detail).toMatchObject({ log_id: LOG, balance_after: 13, before: { amount: 5, notes: "win" }, after: { amount: 8, notes: "fixed" } });
  });

  it("moving a log to another group moves the balance and audits the new group", async () => {
    await seed();
    await as(ADMIN, "select public.fn_admin_update_token_log($1, 2, 5, 'win', 'DAY1_GAME')", [LOG]);
    expect(await balance(1)).toBe(5);
    expect(await balance(2)).toBe(8);
    const [a] = await audits("tokens.log_edit");
    expect(a.target).toBe("group:2");
    expect(a.detail).toMatchObject({ before: { group_id: 1 }, after: { group_id: 2 } });
  });

  it("keeps the log's own type when none is given (a reversal stays a reversal)", async () => {
    await seed();
    await as(ADMIN, "select public.fn_admin_update_token_log($1, 2, 2, 'undo', '')", [LOG2]);
    expect((await q("select transaction_type from token_logs where log_id = $1", [LOG2]))[0].transaction_type).toBe("TOKEN_REVERSAL");
  });

  it("a change that would make the balance negative changes nothing and audits nothing", async () => {
    await seed();
    expect(await fails(as(ADMIN, "select public.fn_admin_update_token_log($1, 1, -20, 'x', 'DAY1_GAME')", [LOG]))).toMatch(/NEGATIVE_BALANCE/);
    expect(await balance(1)).toBe(10);
    expect((await q("select amount from token_logs where log_id = $1", [LOG]))[0].amount).toBe(5);
    expect(await audits("tokens.log_edit")).toHaveLength(0);
  });

  it("unknown log, unknown group, and anyone but Admin are refused", async () => {
    await seed();
    expect(await fails(as(ADMIN, "select public.fn_admin_update_token_log(gen_random_uuid(), 1, 1, '', '')"))).toMatch(/LOG_NOT_FOUND/);
    expect(await fails(as(ADMIN, "select public.fn_admin_update_token_log($1, 99, 1, '', '')", [LOG]))).toMatch(/GROUP_NOT_FOUND/);
    expect(await fails(as(HOGM, "select public.fn_admin_update_token_log($1, 1, 9, '', '')", [LOG]))).toMatch(/PERMISSION_DENIED/);
    expect(await balance(1)).toBe(10);
  });
});

describe("fn_admin_delete_token_log", () => {
  it("removes the log row, takes its amount off the balance, and audits it", async () => {
    await seed();
    await as(ADMIN, "select public.fn_admin_delete_token_log($1)", [LOG]);
    expect(await balance(1)).toBe(5);
    expect(await q("select 1 from token_logs where log_id = $1", [LOG])).toHaveLength(0);
    const [a] = await audits("tokens.log_delete");
    expect(a.target).toBe("group:1");
    expect(a.detail).toMatchObject({ log_id: LOG, group_id: 1, amount: 5, type: "DAY1_GAME", balance_after: 5 });
  });

  it("refuses when taking the amount off would go below zero", async () => {
    await seed();
    await q("update groups set token_balance = 2 where id = 1");
    expect(await fails(as(ADMIN, "select public.fn_admin_delete_token_log($1)", [LOG]))).toMatch(/NEGATIVE_BALANCE/);
    expect(await balance(1)).toBe(2);
    expect(await q("select 1 from token_logs where log_id = $1", [LOG])).toHaveLength(1);
    expect(await audits("tokens.log_delete")).toHaveLength(0);
  });

  it("only Admin", async () => {
    await seed();
    expect(await fails(as(HOGM, "select public.fn_admin_delete_token_log($1)", [LOG]))).toMatch(/PERMISSION_DENIED/);
  });
});
