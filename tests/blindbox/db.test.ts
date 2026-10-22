// Database tests for the blind-box buy flow (migrations 0054 + 0070).
// A real Postgres runs in a temp folder (embedded-postgres); the Supabase
// pieces the migrations lean on are a small stub (stub-schema.sql). Each call
// below opens its own connection, so "simultaneous scans" are real concurrent
// transactions, not a loop.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const sql = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const PORT = 54329;
let pg: EmbeddedPostgres;
let dataDir: string;
let admin: Client;

async function connect(): Promise<Client> {
  const c = new Client({ host: "localhost", port: PORT, user: "postgres", password: "pw", database: "bb" });
  await c.connect();
  return c;
}

// ids
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = uid(1);
const GM = uid(2);
const FACI = uid(3);
const freshie = (g: number) => uid(100 + g); // one login per group, like the real app

type Row = Record<string, unknown>;

/** Runs one RPC as `user` in its own transaction, as the `authenticated` role. */
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

/** The error message, or null if the call succeeded. */
async function fails(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

async function q<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await admin.query(text, params)).rows as T[];
}

async function asUser<T extends Row = Row>(user: string, text: string): Promise<T[]> {
  const c = await connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    const r = await c.query(text);
    await c.query("commit");
    return r.rows as T[];
  } finally {
    await c.end();
  }
}

const setConfig = (key: string, value: unknown) =>
  q("insert into game_config (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value", [
    key,
    JSON.stringify(value),
  ]);

const balance = async (g: number) => Number((await q("select token_balance from groups where id=$1", [g]))[0].token_balance);

// seller handles filled in beforeAll
let normalType: number;
let goldType: number;
const seller: Record<string, { sellerId: number; version: number; normal?: number; gold?: number }> = {};

const sellerOf = async (profileId?: string, stationId?: number) => {
  const r = await q(
    "select s.id, s.qr_version from blind_box_sellers s where ($1::uuid is not null and s.profile_id=$1) or ($2::integer is not null and s.station_id=$2)",
    [profileId ?? null, stationId ?? null]
  );
  return { sellerId: Number(r[0].id), version: Number(r[0].qr_version) };
};
const assignmentOf = async (type: number, profileId?: string, stationId?: number) =>
  Number(
    (
      await q("select id from blind_box_assignments where type_id=$1 and (profile_id=$2::uuid or station_id=$3::integer)", [
        type,
        profileId ?? null,
        stationId ?? null,
      ])
    )[0].id
  );

const preview = (user: string, s: { sellerId: number; version: number }) =>
  rpc(user, "fn_bb_seller_preview", [s.sellerId, s.version]);
const buy = (user: string, s: { sellerId: number; version: number }, assignment: number, key: string | null) =>
  rpc(user, "fn_bb_buy", [s.sellerId, s.version, assignment, key]);
const open = (user: string, claimId: number) => rpc(user, "fn_bb_open", [claimId]);

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "bb-pg-"));
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port: PORT, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"] });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("bb");
  admin = await connect();

  await admin.query(sql("tests/blindbox/stub-schema.sql"));
  await admin.query(sql("supabase/migrations/0054_blindbox_v3.sql"));
  await admin.query(sql("supabase/migrations/0070_blindbox_buy_flow.sql"));
  await admin.query(sql("supabase/migrations/0090_blindbox_qr_hardening.sql"));
  await admin.query(sql("supabase/migrations/0091_blindbox_review_fixes.sql"));

  // 12 groups with 20 tokens each, one Freshie login per group
  for (let g = 1; g <= 12; g++) {
    await q("insert into groups (id, name, token_balance) values ($1, $2, 20)", [g, `Group ${g}`]);
    await q("insert into profiles (id, role, full_name, group_id) values ($1, 'freshie', $2, $3)", [freshie(g), `Group ${g}`, g]);
  }
  for (const [code, name] of [
    ["S1", "Station One"],
    ["S2", "Station Two"],
    ["S3", "Station Three"],
    ["S4", "Station Four"],
    ["S5", "Station Five"],
  ]) {
    await q("insert into stations (code, name) values ($1, $2)", [code, name]);
  }
  await q("insert into profiles (id, role, full_name) values ($1, 'admin', 'Admin')", [ADMIN]);
  await q("insert into profiles (id, role, full_name, station_id) values ($1, 'gm', 'Gina GM', 1)", [GM]);
  await q("insert into profiles (id, role, full_name, group_id) values ($1, 'faci', 'Faci', 1)", [FACI]);

  // Types: Normal costs 3 (wins 1-2), Gold costs 5 (wins 4-6, special)
  normalType = Number((await rpc(ADMIN, "fn_bb_type_save", [null, "Normal", 1, 2, 3, 100, false])).id);
  goldType = Number((await rpc(ADMIN, "fn_bb_type_save", [null, "Gold", 4, 6, 5, 50, true])).id);

  // GM Gina (account): 2 Normal + 1 Gold.  S1 (station): 3 Normal.  S2: 1 Normal.
  // S3, S4, S5: 1 Normal each (for the group cap).  S5 also holds nothing else.
  await rpc(ADMIN, "fn_bb_assign", [normalType, 2, null, [GM], null, false]);
  await rpc(ADMIN, "fn_bb_assign", [goldType, 1, null, [GM], null, false]);
  await rpc(ADMIN, "fn_bb_assign", [normalType, 3, null, null, [1], false]);
  await rpc(ADMIN, "fn_bb_assign", [normalType, 1, null, null, [2, 3, 4, 5], false]);

  seller.gm = {
    ...(await sellerOf(GM)),
    normal: await assignmentOf(normalType, GM),
    gold: await assignmentOf(goldType, GM),
  };
  for (const n of [1, 2, 3, 4, 5]) {
    seller[`s${n}`] = { ...(await sellerOf(undefined, n)), normal: await assignmentOf(normalType, undefined, n) };
  }
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

describe("one code per seller", () => {
  it("gives a seller with two box types a single seller row and QR version", async () => {
    const rows = await q("select count(distinct seller_id) as n, count(*) as total from blind_box_assignments where profile_id=$1", [GM]);
    expect(Number(rows[0].total)).toBe(2);
    expect(Number(rows[0].n)).toBe(1);
  });

  it("the scan page lists every box type the seller still has", async () => {
    const p = await preview(freshie(1), seller.gm);
    expect(p.status).toBe("ok");
    expect(p.seller_name).toBe("Gina GM");
    expect(p.group_name).toBe("Group 1");
    expect(p.balance).toBe(20);
    const names = (p.options as Row[]).map((o) => o.type_name);
    expect(names).toEqual(["Normal", "Gold"]); // cheapest first
    // no prize range is ever shown
    expect(JSON.stringify(p)).not.toMatch(/min_tokens|max_tokens/);
  });

  it("a logged-out visitor can see only the seller's name, and only for a valid code", async () => {
    const c = await connect();
    try {
      await c.query("begin");
      await c.query("set local role anon");
      const ok = await c.query("select public.fn_bb_seller_public($1, $2) as r", [seller.gm.sellerId, seller.gm.version]);
      expect(ok.rows[0].r).toEqual({ seller_name: "Gina GM" });
      await c.query("savepoint a");
      await expect(c.query("select public.fn_bb_seller_public($1, 999)", [seller.gm.sellerId])).rejects.toThrow(/BOX_UNKNOWN/);
      await c.query("rollback to savepoint a");
      // anon cannot preview or buy
      await expect(c.query("select public.fn_bb_seller_preview($1, $2)", [seller.gm.sellerId, seller.gm.version])).rejects.toThrow(/permission denied/);
    } finally {
      await c.query("rollback").catch(() => {});
      await c.end();
    }
  });

  it("refuses non-Freshie accounts and bad codes", async () => {
    expect(await fails(preview(FACI, seller.gm))).toMatch(/FRESHIE_ONLY/);
    expect(await fails(preview(ADMIN, seller.gm))).toMatch(/FRESHIE_ONLY/);
    expect(await fails(rpc(freshie(1), "fn_bb_seller_preview", [seller.gm.sellerId, 999]))).toMatch(/BOX_UNKNOWN/);
    expect(await fails(rpc(freshie(1), "fn_bb_seller_preview", [99999, 1]))).toMatch(/BOX_UNKNOWN/);
  });
});

describe("BUY", () => {
  it("charges the price, takes one box from stock and keeps the box unopened", async () => {
    const before = await balance(1);
    const r = await buy(freshie(1), seller.gm, seller.gm.normal!, "k-g1-gm");
    expect(r.ok).toBe(true);
    expect(r.duplicate).toBe(false);
    expect(r.price).toBe(3);
    expect(r.balance).toBe(before - 3);
    expect(await balance(1)).toBe(before - 3);

    const claim = (await q("select * from blind_box_claims where id=$1", [r.claim_id]))[0];
    expect(claim.status).toBe("owned");
    expect(claim.tokens).toBeNull();
    expect(claim.group_id).toBe(1);

    const a = (await q("select quantity, opened from blind_box_assignments where id=$1", [seller.gm.normal]))[0];
    expect(a.opened).toBe(1);
    const tx = await q("select delta from token_transactions where group_id=1 order by id desc limit 1");
    expect(tx[0].delta).toBe(-3);
  });

  it("a Freshie cannot read the hidden prize range", async () => {
    const ranges = await asUser(freshie(1), "select * from blind_box_claim_ranges").catch(() => []);
    expect(ranges).toHaveLength(0);
    const own = await asUser(freshie(1), "select * from blind_box_claims");
    expect(own.length).toBeGreaterThan(0);
    expect(Object.keys(own[0])).not.toContain("min_tokens");
    expect(Object.keys(own[0])).not.toContain("max_tokens");
  });

  it("scanning the same code again shows 'already bought from this seller' and buying again fails", async () => {
    const p = await preview(freshie(1), seller.gm);
    expect(p.status).toBe("already_from_seller");
    expect(await fails(buy(freshie(1), seller.gm, seller.gm.gold!, "k-g1-gm-2"))).toMatch(/BB_ALREADY_FROM_SELLER/);
    expect(await balance(1)).toBe(17);
  });

  it("the same code keeps working for other groups until the seller runs out", async () => {
    // Gina holds Normal x2, Gold x1. Group 1 already took a Normal.
    const r2 = await buy(freshie(2), seller.gm, seller.gm.normal!, "k-g2-gm"); // Normal #2
    expect(r2.ok).toBe(true);
    // Normal is gone, Gold remains: the page still works and shows only Gold as buyable
    const p3 = await preview(freshie(3), seller.gm);
    expect(p3.status).toBe("ok");
    const opts = p3.options as Row[];
    expect(opts.find((o) => o.type_name === "Normal")!.status).toBe("sold_out");
    expect(opts.find((o) => o.type_name === "Gold")!.status).toBe("ok");
    expect(await fails(buy(freshie(3), seller.gm, seller.gm.normal!, "k-g3-n"))).toMatch(/BOXES_SOLD_OUT/);

    const g3 = await buy(freshie(3), seller.gm, seller.gm.gold!, "k-g3-gold");
    expect(g3.price).toBe(5);
    expect(g3.special).toBe(true);

    // everything sold: the whole page says sold out, buying is refused
    const p4 = await preview(freshie(4), seller.gm);
    expect(p4.status).toBe("sold_out");
    expect(await fails(buy(freshie(4), seller.gm, seller.gm.gold!, "k-g4-gold"))).toMatch(/BOXES_SOLD_OUT/);
    expect(await balance(4)).toBe(20); // nothing charged for the failed buy
  });

  it("refuses when the group cannot afford it, and charges nothing", async () => {
    await q("update groups set token_balance = 2 where id = 5");
    const p = await preview(freshie(5), seller.s1);
    expect((p.options as Row[])[0].status).toBe("insufficient");
    expect(await fails(buy(freshie(5), seller.s1, seller.s1.normal!, "k-g5-s1"))).toMatch(/INSUFFICIENT_BALANCE/);
    expect(await balance(5)).toBe(2);
    expect(await q("select 1 from blind_box_claims where group_id=5")).toHaveLength(0);
    await q("update groups set token_balance = 20 where id = 5");
  });

  it("is idempotent: the same key twice charges once; another group cannot reuse the key", async () => {
    const a = await buy(freshie(6), seller.s2, seller.s2.normal!, "k-dup");
    const b = await buy(freshie(6), seller.s2, seller.s2.normal!, "k-dup");
    expect(a.claim_id).toBe(b.claim_id);
    expect(b.duplicate).toBe(true);
    expect(await balance(6)).toBe(17);
    expect(await q("select 1 from blind_box_claims where group_id=6")).toHaveLength(1);
    expect(await fails(buy(freshie(7), seller.s2, seller.s2.normal!, "k-dup"))).toMatch(/BOX_UNKNOWN/);
  });

  it("enforces the group cap (4 boxes) on bought boxes, opened or not", async () => {
    // group 8 buys from S3, S4, S5, S1 (4 boxes), then is refused a 5th
    for (const [i, s] of (["s3", "s4", "s5", "s1"] as const).entries()) {
      const r = await buy(freshie(8), seller[s], seller[s].normal!, `k-g8-${i}`);
      expect(r.ok).toBe(true);
    }
    // a fifth seller that still has stock (the Admin account holds one box)
    await rpc(ADMIN, "fn_bb_assign", [normalType, 1, null, [ADMIN], null, false]);
    const fifth = { ...(await sellerOf(ADMIN)), normal: await assignmentOf(normalType, ADMIN) };
    const p = await preview(freshie(8), fifth);
    expect(p.status).toBe("cap_reached");
    expect(await fails(buy(freshie(8), fifth, fifth.normal, "k-g8-5"))).toMatch(/BB_GROUP_CAP/);
    expect(await balance(8)).toBe(20 - 4 * 3);
  });

  it("only Freshie group logins can buy", async () => {
    expect(await fails(buy(FACI, seller.s1, seller.s1.normal!, "k-faci"))).toMatch(/FRESHIE_ONLY/);
    expect(await fails(buy(GM, seller.s1, seller.s1.normal!, "k-gm"))).toMatch(/FRESHIE_ONLY/);
  });
});

describe("OPEN (from the Items page)", () => {
  let claimId: number;

  it("rolls a prize inside the saved range and adds the tokens", async () => {
    claimId = Number((await q("select id from blind_box_claims where group_id=1"))[0].id);
    const before = await balance(1);
    const r = await open(freshie(1), claimId);
    expect(r.ok).toBe(true);
    expect(r.duplicate).toBe(false);
    expect(r.tokens).toBeGreaterThanOrEqual(1);
    expect(r.tokens).toBeLessThanOrEqual(2);
    expect(await balance(1)).toBe(before + Number(r.tokens));
    const c = (await q("select status, tokens, opened_at from blind_box_claims where id=$1", [claimId]))[0];
    expect(c.status).toBe("opened");
    expect(c.opened_at).not.toBeNull();
  });

  it("opening twice (double-tap) returns the same prize and pays once", async () => {
    const first = (await q("select tokens from blind_box_claims where id=$1", [claimId]))[0].tokens;
    const before = await balance(1);
    const again = await open(freshie(1), claimId);
    expect(again.duplicate).toBe(true);
    expect(again.tokens).toBe(first);
    expect(await balance(1)).toBe(before);
  });

  it("opens the special box from its own range", async () => {
    const gold = Number((await q("select id from blind_box_claims where group_id=3"))[0].id);
    const r = await open(freshie(3), gold);
    expect(r.tokens).toBeGreaterThanOrEqual(4);
    expect(r.tokens).toBeLessThanOrEqual(6);
  });

  it("another group cannot open someone else's box; Faci and staff cannot open at all", async () => {
    const c2 = Number((await q("select id from blind_box_claims where group_id=2"))[0].id);
    expect(await fails(open(freshie(9), c2))).toMatch(/BOX_UNKNOWN/);
    expect(await fails(open(FACI, c2))).toMatch(/FRESHIE_ONLY/);
    expect(await fails(open(ADMIN, c2))).toMatch(/FRESHIE_ONLY/);
  });

  it("10 simultaneous taps on one box pay exactly once", async () => {
    const c2 = Number((await q("select id from blind_box_claims where group_id=2"))[0].id);
    const before = await balance(2);
    const rs = await Promise.all(Array.from({ length: 10 }, () => open(freshie(2), c2)));
    const fresh = rs.filter((r) => r.duplicate === false);
    expect(fresh).toHaveLength(1);
    expect(new Set(rs.map((r) => r.tokens)).size).toBe(1);
    expect(await balance(2)).toBe(before + Number(fresh[0].tokens));
  });
});

describe("kill-switches: they stop BUY, never OPEN", () => {
  it("blind boxes off: buying is refused, a box already bought still opens", async () => {
    // S1 has 3 boxes at the start; plenty left for this check
    const s1 = seller.s1;
    const r = await buy(freshie(10), s1, s1.normal!, "k-g10-s1");

    await setConfig("blindbox_disabled", true);
    expect((await preview(freshie(11), s1)).status).toBe("disabled");
    expect(await fails(buy(freshie(11), s1, s1.normal!, "k-g11-off"))).toMatch(/BLINDBOX_DISABLED/);
    const opened = await open(freshie(10), Number(r.claim_id));
    expect(opened.ok).toBe(true);
    await setConfig("blindbox_disabled", false);
  });

  it("tokens frozen: buying is refused, a box already bought still opens", async () => {
    const s1 = seller.s1;
    const r = await buy(freshie(11), s1, s1.normal!, "k-g11-s1");
    await setConfig("tokens_frozen", true);
    expect((await preview(freshie(12), s1)).status).toBe("frozen");
    expect(await fails(buy(freshie(12), s1, s1.normal!, "k-g12-frozen"))).toMatch(/TOKENS_FROZEN/);
    const opened = await open(freshie(11), Number(r.claim_id));
    expect(opened.ok).toBe(true);
    await setConfig("tokens_frozen", false);
  });
});

describe("Admin: regenerate, stock edits, reset", () => {
  it("regenerating kills the seller's old code and the new one works; bought boxes are untouched", async () => {
    const stationSeller = await sellerOf(undefined, 4);
    const old = { ...stationSeller };
    const claimsBefore = (await q("select count(*) n from blind_box_claims"))[0].n;
    const assignment = await assignmentOf(normalType, undefined, 4);
    await rpc(ADMIN, "fn_bb_regenerate", [assignment]);
    expect(await fails(rpc(freshie(9), "fn_bb_seller_preview", [old.sellerId, old.version]))).toMatch(/BOX_UNKNOWN/);
    expect(await fails(buy(freshie(9), old, assignment, "k-old"))).toMatch(/BOX_UNKNOWN/);
    const fresh = await sellerOf(undefined, 4);
    expect(fresh.version).not.toBe(old.version);
    expect((await preview(freshie(9), fresh)).seller_name).toBe("Station Four");
    expect((await q("select count(*) n from blind_box_claims"))[0].n).toBe(claimsBefore);
  });

  it("Admin cannot set a seller's quantity below what has been bought", async () => {
    const a = seller.gm.normal!;
    expect(await fails(rpc(ADMIN, "fn_bb_set_quantity", [a, 1]))).toMatch(/BB_QTY_BELOW_OPENED/);
    expect(await fails(rpc(freshie(1), "fn_bb_set_quantity", [a, 5]))).toMatch(/PERMISSION_DENIED/);
  });

  it("QR versions are random, so a guessed seller id + version cannot buy without scanning", async () => {
    const versions = (await q<{ qr_version: number }>("select qr_version from blind_box_sellers")).map((r) => Number(r.qr_version));
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions.every((v) => v > 1000)).toBe(true);
    for (const guess of [1, 2, 3]) {
      expect(await fails(buy(freshie(12), { sellerId: seller.s5.sellerId, version: guess }, seller.s5.normal!, `guess-${guess}`))).toMatch(/BOX_UNKNOWN/);
    }
  });

  it("an assignment with sold boxes cannot be deleted, not even by deleting its seller", async () => {
    expect(await fails(q("delete from blind_box_assignments where id = $1", [seller.gm.normal]))).toMatch(/BB_HAS_SALES/);
    expect(await fails(q("delete from profiles where id = $1", [GM]))).toMatch(/BB_HAS_SALES/);
    expect(Number((await q("select count(*) n from blind_box_assignments where id = $1", [seller.gm.normal]))[0].n)).toBe(1);
  });

  it("seller rows are in the realtime publication, so Regenerate reaches open screens", async () => {
    const r = await q("select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'blind_box_sellers'");
    expect(r.length).toBe(1);
  });

  it("reset puts tokens back (unopened boxes refund only their price) and clears everything", async () => {
    const before = await q("select sum(token_balance) as t from groups");
    // reset is locked unless Rehearsal mode is on
    expect(await fails(rpc(ADMIN, "fn_bb_reset", ["openings", "RESET", true]))).toMatch(/BB_RESET_LOCKED/);
    await setConfig("rehearsal_mode", true);
    expect(await fails(rpc(ADMIN, "fn_bb_reset", ["openings", "nope", true]))).toMatch(/BB_RESET_CONFIRM/);
    const res = await rpc(ADMIN, "fn_bb_reset", ["openings", "RESET", true]);
    expect(res.ok).toBe(true);
    expect(await q("select 1 from blind_box_claims")).toHaveLength(0);
    expect(await q("select 1 from blind_box_claim_ranges")).toHaveLength(0);
    expect(Number((await q("select sum(opened) s from blind_box_assignments"))[0].s)).toBe(0);
    // every group is back to its starting 20 tokens
    const after = await q("select id, token_balance from groups order by id");
    for (const g of after) expect(g.token_balance).toBe(20);
    expect(before).toBeDefined();
    await setConfig("rehearsal_mode", false);
  });
});

describe("many people scanning the same code at once", () => {
  it("12 groups scan one seller with 3 boxes: exactly 3 succeed, the rest are told sold out, nobody is overcharged", async () => {
    // a fresh seller with exactly 3 boxes
    await rpc(ADMIN, "fn_bb_assign", [normalType, 3, null, [GM], null, false]).catch(() => {});
    await q("update blind_box_assignments set quantity = 3, opened = 0 where id = $1", [seller.gm.normal]);
    await q("delete from blind_box_claims where seller_profile_id = $1", [GM]);
    await q("update groups set token_balance = 20");
    await q("update blind_box_assignments set quantity = 0, opened = 0 where id = $1 and false", [seller.gm.gold]);
    // park the Gold stock so only Normal x3 is on sale
    await q("update blind_box_assignments set active = false where id = $1", [seller.gm.gold]);

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        buy(freshie(i + 1), seller.gm, seller.gm.normal!, `k-race-${i + 1}`).then(
          () => "ok",
          (e: Error) => e.message
        )
      )
    );
    const ok = results.filter((r) => r === "ok");
    const soldOut = results.filter((r) => /BOXES_SOLD_OUT/.test(r));
    expect(ok).toHaveLength(3);
    expect(soldOut).toHaveLength(9);

    const a = (await q("select quantity, opened from blind_box_assignments where id=$1", [seller.gm.normal]))[0];
    expect(a.opened).toBe(3);
    expect(Number((await q("select count(*) n from blind_box_claims where seller_profile_id=$1", [GM]))[0].n)).toBe(3);
    // exactly the 3 buyers paid 3 tokens; the 9 others still have 20
    const bal = await q("select token_balance from groups");
    expect(bal.filter((b) => b.token_balance === 17)).toHaveLength(3);
    expect(bal.filter((b) => b.token_balance === 20)).toHaveLength(9);
  });

  it("one group tapping BUY 8 times at once (same key) buys once; 8 times with different keys also buys once", async () => {
    await q("delete from blind_box_claims");
    await q("update blind_box_assignments set opened = 0");
    await q("update groups set token_balance = 20");

    const sameKey = await Promise.all(
      Array.from({ length: 8 }, () => buy(freshie(1), seller.s1, seller.s1.normal!, "k-same").then((r) => r, (e: Error) => e))
    );
    expect(sameKey.filter((r) => !(r instanceof Error) && (r as Row).duplicate === false)).toHaveLength(1);
    expect(await balance(1)).toBe(17);
    expect(Number((await q("select count(*) n from blind_box_claims where group_id=1"))[0].n)).toBe(1);

    await q("delete from blind_box_claims");
    await q("update blind_box_assignments set opened = 0");
    await q("update groups set token_balance = 20");
    const diffKeys = await Promise.all(
      Array.from({ length: 8 }, (_, i) => buy(freshie(2), seller.s1, seller.s1.normal!, `k-diff-${i}`).then((r) => r, (e: Error) => e))
    );
    expect(diffKeys.filter((r) => !(r instanceof Error))).toHaveLength(1);
    expect(await balance(2)).toBe(17);
  });

  it("a mixed storm of buys and opens across groups leaves tokens and stock consistent", async () => {
    await q("delete from blind_box_claims");
    await q("update blind_box_assignments set opened = 0, active = true");
    await q("update groups set token_balance = 20");
    await q("delete from token_transactions");

    // groups 1-6 each try S1 (3 boxes) and S2 (1 box) at once
    const buys = await Promise.all(
      [1, 2, 3, 4, 5, 6].flatMap((g) => [
        buy(freshie(g), seller.s1, seller.s1.normal!, `st-${g}-s1`).then((r) => ({ g, r }), () => null),
        buy(freshie(g), seller.s2, seller.s2.normal!, `st-${g}-s2`).then((r) => ({ g, r }), () => null),
      ])
    );
    const won = buys.filter((x): x is { g: number; r: Row } => x !== null);
    expect(won).toHaveLength(4); // 3 + 1
    // open everything that was bought, all at once
    await Promise.all(won.map(({ g, r }) => open(freshie(g), Number(r.claim_id))));

    // ledger check: total balance == 12*... start + sum(tokens) - sum(price)
    const claims = await q("select price, tokens, status from blind_box_claims");
    expect(claims.every((c) => c.status === "opened")).toBe(true);
    const net = claims.reduce((n, c) => n + Number(c.tokens) - Number(c.price), 0);
    const total = Number((await q("select sum(token_balance) s from groups"))[0].s);
    expect(total).toBe(12 * 20 + net);
    const txSum = Number((await q("select coalesce(sum(delta),0) s from token_transactions"))[0].s);
    expect(txSum).toBe(net);
  });
});

describe("review fixes (0091)", () => {
  const fresh = async () => {
    await q("delete from blind_box_claims");
    await q("update blind_box_assignments set opened = 0, active = true");
    await q("update groups set token_balance = 20");
    await q("delete from audit_log where action = 'tokens.reset'");
  };
  const buyAt = (user: string, s: { sellerId: number; version: number }, assignment: number, key: string, price: number) =>
    rpc(user, "fn_bb_buy_at", [s.sellerId, s.version, assignment, key, price]);

  it("BUY at a price that changed charges nothing; the shown price buys; a retry of a done purchase still returns it", async () => {
    await fresh();
    // Normal costs 3; the page showed 2
    expect(await fails(buyAt(freshie(7), seller.s3, seller.s3.normal!, "pc-1", 2))).toMatch(/BB_PRICE_CHANGED/);
    expect(await balance(7)).toBe(20);
    expect(await q("select 1 from blind_box_claims where group_id = 7")).toHaveLength(0);
    expect(Number((await q("select opened from blind_box_assignments where id = $1", [seller.s3.normal]))[0].opened)).toBe(0);

    const ok = await buyAt(freshie(7), seller.s3, seller.s3.normal!, "pc-2", 3);
    expect(ok.ok).toBe(true);
    expect(await balance(7)).toBe(17);
    const again = await buyAt(freshie(7), seller.s3, seller.s3.normal!, "pc-2", 2);
    expect(again.duplicate).toBe(true);
    expect(await balance(7)).toBe(17);
  });

  it("a seller changed to Faci has their own boxes turned off, and back on when they are a GM again", async () => {
    await fresh();
    const gm2 = uid(6);
    await q("insert into profiles (id, role, full_name) values ($1, 'gm', 'Gus GM')", [gm2]);
    await rpc(ADMIN, "fn_bb_assign", [normalType, 1, null, [gm2], null, false]);
    const s = await sellerOf(gm2);
    expect((await preview(freshie(7), s)).status).toBe("ok");

    await q("update profiles set role = 'faci' where id = $1", [gm2]);
    expect((await q("select active from blind_box_assignments where profile_id = $1", [gm2]))[0].active).toBe(false);
    expect(await fails(preview(freshie(7), s))).toMatch(/BOX_UNKNOWN/);
    // a station's boxes are not touched by anyone's role change
    expect((await q("select bool_and(active) a from blind_box_assignments where station_id is not null"))[0].a).toBe(true);

    // back to GM: the boxes the role change turned off come back on
    await q("update profiles set role = 'gm' where id = $1", [gm2]);
    expect((await q("select active from blind_box_assignments where profile_id = $1", [gm2]))[0].active).toBe(true);
    expect((await preview(freshie(7), s)).status).toBe("ok");

    // Admin switches them off by hand: a demote + promote does not undo that
    const a = Number((await q("select id from blind_box_assignments where profile_id = $1", [gm2]))[0].id);
    await rpc(ADMIN, "fn_bb_assignment_set_active", [a, false]);
    await q("update profiles set role = 'faci' where id = $1", [gm2]);
    await q("update profiles set role = 'gm' where id = $1", [gm2]);
    expect((await q("select active from blind_box_assignments where id = $1", [a]))[0].active).toBe(false);
  });

  it("after a Token page reset, putting tokens back only refunds boxes bought since then", async () => {
    await fresh();
    const s4 = await sellerOf(undefined, 4); // regenerated by an earlier test
    await buy(freshie(8), s4, seller.s4.normal!, "tr-8"); // 20 -> 17, before the token reset
    // the Token page reset: every balance to 0, logged as tokens.reset
    await q("update groups set token_balance = 0");
    await q("insert into audit_log (action, target) values ('tokens.reset', 'tokens')");
    await q("update groups set token_balance = 5 where id = 9");
    await buy(freshie(9), seller.s5, seller.s5.normal!, "tr-9"); // 5 -> 2, after the token reset

    await setConfig("rehearsal_mode", true);
    await rpc(ADMIN, "fn_bb_reset", ["openings", "RESET", true]);
    await setConfig("rehearsal_mode", false);
    expect(await balance(8)).toBe(0); // its price was already wiped by the token reset
    expect(await balance(9)).toBe(5); // bought after it: refunded
  });

  it("a GM reads only their own and their current station's boxes and seller rows; a Freshie reads none", async () => {
    const rows = await asUser<{ profile_id: string | null; station_id: number | null }>(GM, "select profile_id, station_id from blind_box_assignments");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.profile_id === GM || r.station_id === 1)).toBe(true);
    const sellers = await asUser<{ profile_id: string | null; station_id: number | null }>(GM, "select profile_id, station_id from blind_box_sellers");
    expect(sellers.every((r) => r.profile_id === GM || r.station_id === 1)).toBe(true);
    // moved to station 2 for the day: station 1's pool disappears, station 2's appears
    await q("update profiles set station_id = 2 where id = $1", [GM]);
    const moved = await asUser<{ station_id: number | null }>(GM, "select station_id from blind_box_assignments where station_id is not null");
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.every((r) => r.station_id === 2)).toBe(true);
    await q("update profiles set station_id = 1 where id = $1", [GM]);
    expect(await asUser(freshie(1), "select 1 from blind_box_assignments")).toHaveLength(0);
    expect(await asUser(freshie(1), "select 1 from blind_box_sellers")).toHaveLength(0);
  });

  it("Reset everything gives every seller a new QR version, so rehearsal QRs stay dead", async () => {
    await fresh();
    const before = await q<{ id: number; qr_version: number }>("select id, qr_version from blind_box_sellers order by id");
    await setConfig("rehearsal_mode", true);
    await rpc(ADMIN, "fn_bb_reset", ["all", "RESET", false]);
    await setConfig("rehearsal_mode", false);
    const after = await q<{ id: number; qr_version: number }>("select id, qr_version from blind_box_sellers order by id");
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
    after.forEach((r, i) => expect(r.qr_version).not.toBe(before[i].qr_version));
  });
});


// Runs last: applies 0100 on top of everything above.
describe("0100: the Spot box, no station boxes, Restore only", () => {
  let spot: { sellerId: number; version: number };
  let spotAssignment: number;
  let type: number;

  beforeAll(async () => {
    // Before 0100: station 1 holds 2 unsold boxes, station 2 sold 1 of 1.
    type = Number((await rpc(ADMIN, "fn_bb_type_save", [null, "Plain", 1, 1, 0, 20, false])).id);
    await rpc(ADMIN, "fn_bb_assign", [type, 2, null, null, [1], false]);
    await rpc(ADMIN, "fn_bb_assign", [type, 1, null, null, [2], false]);
    await buy(freshie(1), await sellerOf(undefined, 2), await assignmentOf(type, undefined, 2), "pre-0100");

    await admin.query(sql("supabase/migrations/0100_blindbox_spot_no_stations.sql"));
    await admin.query(sql("supabase/migrations/0100_blindbox_spot_no_stations.sql")); // safe to run again
  }, 60_000);

  it("deletes unsold station boxes and switches sold ones off", async () => {
    expect(await q("select 1 from blind_box_assignments where station_id = 1")).toHaveLength(0);
    const kept = await q("select active, opened from blind_box_assignments where station_id = 2");
    expect(kept).toEqual([{ active: false, opened: 1 }]);
  });

  it("assigns to people only; a station row is refused", async () => {
    await rpc(ADMIN, "fn_bb_assign", [type, 1, null, [GM]]);
    expect(await fails(rpc(ADMIN, "fn_bb_assign", [type, 1, null, null]))).toMatch(/BB_TARGET_INVALID/);
    expect(await fails(q("insert into blind_box_assignments (type_id, station_id, quantity) values ($1, 3, 1)", [type]))).toMatch(
      /BB_TARGET_INVALID/
    );
  });

  it("only Restore boxes is left", async () => {
    await setConfig("rehearsal_mode", true);
    expect(await fails(rpc(ADMIN, "fn_bb_reset", ["all", "RESET", false]))).toMatch(/BB_RESET_SCOPE/);
    await setConfig("rehearsal_mode", false);
  });

  it("only Admin sets up the Spot", async () => {
    expect(await fails(rpc(GM, "fn_bb_spot_save", [1, 2, 2, true]))).toMatch(/PERMISSION_DENIED/);
    expect(await fails(rpc(ADMIN, "fn_bb_spot_save", [3, 2, 2, true]))).toMatch(/BB_RANGE_INVALID/);
    await rpc(ADMIN, "fn_bb_spot_save", [2, 3, 2, true]);
    const r = await q("select id, qr_version from blind_box_sellers where is_spot");
    spot = { sellerId: Number(r[0].id), version: Number(r[0].qr_version) };
    spotAssignment = Number((await q("select id from blind_box_assignments where seller_id = $1", [spot.sellerId]))[0].id);
  });

  it("a Spot box is free, one per group, and does not count toward the cap", async () => {
    await setConfig("blindbox_group_cap", 0);
    const p = await preview(freshie(4), spot);
    expect(p.spot).toBe(true);
    expect(p.status).toBe("ok");
    expect(p.seller_name).toBe("Hidden blind box");
    expect((p.options as Row[]).map((o) => o.price)).toEqual([0]);

    const before = await balance(4);
    const got = await buy(freshie(4), spot, spotAssignment, "spot-4");
    expect(await balance(4)).toBe(before);
    expect((await q("select spot from blind_box_claims where id = $1", [got.claim_id]))[0].spot).toBe(true);
    expect((await preview(freshie(4), spot)).status).toBe("already_from_seller");
    expect(await fails(buy(freshie(4), spot, spotAssignment, "spot-4b"))).toMatch(/BB_ALREADY_FROM_SELLER/);

    // the cap still stops boxes from people
    expect((await preview(freshie(4), await sellerOf(GM))).status).toBe("cap_reached");

    const opened = await open(freshie(4), Number(got.claim_id));
    expect(Number(opened.tokens)).toBeGreaterThanOrEqual(2);
    expect(Number(opened.tokens)).toBeLessThanOrEqual(3);
    await setConfig("blindbox_group_cap", 4);
  });

  it("the pool runs out; settings change without changing the QR", async () => {
    await buy(freshie(5), spot, spotAssignment, "spot-5");
    expect((await preview(freshie(6), spot)).status).toBe("sold_out");
    expect(await fails(rpc(ADMIN, "fn_bb_spot_save", [2, 3, 1, true]))).toMatch(/BB_QTY_BELOW_OPENED/);
    await rpc(ADMIN, "fn_bb_spot_save", [5, 9, 3, true]);
    expect((await q("select qr_version from blind_box_sellers where is_spot"))[0].qr_version).toBe(spot.version);
    expect((await preview(freshie(6), spot)).status).toBe("ok");
    await rpc(ADMIN, "fn_bb_spot_save", [5, 9, 3, false]);
    expect(await fails(preview(freshie(6), spot))).toMatch(/BOX_UNKNOWN/);
    await rpc(ADMIN, "fn_bb_spot_save", [5, 9, 3, true]);
  });

  it("Restore boxes refills the Spot and keeps its QR and settings", async () => {
    await setConfig("rehearsal_mode", true);
    await rpc(ADMIN, "fn_bb_reset", ["openings", "RESET", false]);
    await setConfig("rehearsal_mode", false);
    const a = await q("select a.quantity, a.opened, t.min_tokens, t.max_tokens from blind_box_assignments a join blind_box_types t on t.id = a.type_id where a.id = $1", [spotAssignment]);
    expect(a).toEqual([{ quantity: 3, opened: 0, min_tokens: 5, max_tokens: 9 }]);
    expect((await q("select qr_version from blind_box_sellers where is_spot"))[0].qr_version).toBe(spot.version);
    expect((await preview(freshie(4), spot)).status).toBe("ok");
  });
});
