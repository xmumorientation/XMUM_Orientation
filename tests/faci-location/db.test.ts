// A group's manual location update (migrations 0073 + 0074 + 0075, changesv4.md).
// Any Facilitator in a group sends that group's location; the group shares one
// latest update. Real Postgres (embedded-postgres) + the small Supabase stub
// shared with the station tests.
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
  const c = new Client({ host: "localhost", port: PORT, user: "postgres", password: "pw", database: "fl" });
  await c.connect();
  return c;
};

const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = uid(1);
const HOF = uid(2);
const GM = uid(3);
const FACI_1 = uid(10); // group 1
const FACI_2 = uid(11); // group 1 (a second Faci in the same group)
const FACI_3 = uid(12); // group 2
const FACI_NO_GROUP = uid(13);
const FRESHIE = uid(20); // group 1

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
async function asUser(user: string, text: string): Promise<Row[]> {
  const c = await connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    const r = await c.query(text);
    await c.query("commit");
    return r.rows as Row[];
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
const log = (user: string, status: string, text: string | null, building: string, details?: string | null) =>
  details === undefined
    ? rpc(user, "fn_faci_log_location", [status, text, building]) // details left out entirely
    : rpc(user, "fn_faci_log_location", [status, text, building, details]);
const edit = (id: unknown, status: string, text: string | null, building: string, details?: string | null) =>
  details === undefined
    ? rpc(ADMIN, "fn_admin_edit_faci_location", [id, status, text, building])
    : rpc(ADMIN, "fn_admin_edit_faci_location", [id, status, text, building, details]);
const latest = async (group: number) =>
  (await q("select id, user_id, group_id, status, other_text, building, details, edited_by, edited_at from faci_location_updates where group_id = $1 order by created_at desc, id desc limit 1", [group]))[0];

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "fl-pg-"));
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port: PORT, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"] });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("fl");
  admin = await connect();

  await admin.query(read("tests/stations/stub-schema.sql"));
  await admin.query("create publication supabase_realtime");
  await admin.query(read("supabase/migrations/0073_faci_location_updates.sql"));
  await admin.query(read("supabase/migrations/0074_faci_location_details.sql"));

  await q("insert into groups (id, name) values (1, 'Group 1'), (2, 'Group 2'), (3, 'Group 3')");
  await q("insert into profiles (id, role, full_name) values ($1,'admin','Admin'), ($2,'hof','HOF'), ($3,'gm','GM'), ($4,'faci','Lone Faci')", [ADMIN, HOF, GM, FACI_NO_GROUP]);
  await q("insert into profiles (id, role, full_name, group_id) values ($1,'faci','Faci One',1), ($2,'faci','Faci Two',1), ($3,'faci','Faci Three',2), ($4,'freshie','Freshie',1)", [FACI_1, FACI_2, FACI_3, FRESHIE]);

  // Entries made BEFORE 0075 (per Faci): they must follow their Faci's group.
  const oldFn = async (user: string, building: string) => {
    // the 0074 function (no group yet)
    await rpc(user, "fn_faci_log_location", ["arrived", null, building, "old entry"]);
  };
  await oldFn(FACI_1, "A1");
  await oldFn(FACI_3, "A2");
  await oldFn(FACI_NO_GROUP, "A3"); // no group: cannot be kept
  await admin.query(read("supabase/migrations/0075_faci_location_per_group.sql"));
  await admin.query(read("supabase/migrations/0076_faci_location_options.sql"));
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

describe("migration 0075 moves existing entries to groups", () => {
  it("keeps entries on their Facilitator's group and removes entries from a Facilitator with no group", async () => {
    expect((await latest(1)).building).toBe("A1");
    expect((await latest(2)).building).toBe("A2");
    expect(Number((await q("select count(*) n from faci_location_updates"))[0].n)).toBe(2);
    expect(Number((await q("select count(*) n from faci_location_updates where user_id = $1", [FACI_NO_GROUP]))[0].n)).toBe(0);
  });

  it("group_id is now required", async () => {
    await expect(admin.query("insert into faci_location_updates (user_id, status, building) values ($1, 'arrived', 'A1')", [FACI_1])).rejects.toThrow(/null value|not-null/);
  });
});

describe("any Facilitator in a group sends the group's location", () => {
  it("saves Heading to and Arrived against the sender's group", async () => {
    await log(FACI_1, "heading_to", null, "A3");
    expect(await latest(1)).toMatchObject({ status: "heading_to", building: "A3", group_id: 1, user_id: FACI_1 });
    await log(FACI_1, "arrived", null, "A3");
    expect(await latest(1)).toMatchObject({ status: "arrived" });
  });

  it("a second Facilitator in the SAME group updates that group's latest (the group shares it)", async () => {
    await log(FACI_2, "heading_to", null, "B1", "from Faci Two");
    expect(await latest(1)).toMatchObject({ user_id: FACI_2, group_id: 1, status: "heading_to", building: "B1", details: "from Faci Two" });
    // the other group is untouched
    expect(await latest(2)).toMatchObject({ building: "A2" });
  });

  it("a Facilitator of another group only affects their own group", async () => {
    await log(FACI_3, "arrived", null, "A5");
    expect(await latest(2)).toMatchObject({ group_id: 2, building: "A5", user_id: FACI_3 });
    expect(await latest(1)).toMatchObject({ building: "B1" });
  });

  it("a Facilitator with no group cannot send one", async () => {
    expect(await fails(log(FACI_NO_GROUP, "arrived", null, "A1"))).toMatch(/NOT_IN_GROUP/);
  });

  it("only a Facilitator can send", async () => {
    for (const who of [ADMIN, GM, HOF, FRESHIE]) {
      expect(await fails(log(who, "arrived", null, "A1"))).toMatch(/PERMISSION_DENIED/);
    }
  });

  it("Other needs typed text and keeps it (trimmed); typed text on other statuses is dropped", async () => {
    expect(await fails(log(FACI_1, "other", null, "A1"))).toMatch(/LOC_OTHER_TEXT_REQUIRED/);
    expect(await fails(log(FACI_1, "other", "   ", "A1"))).toMatch(/LOC_OTHER_TEXT_REQUIRED/);
    await log(FACI_1, "other", "  Taking photos  ", "Track & Field");
    expect(await latest(1)).toMatchObject({ status: "other", other_text: "Taking photos", building: "Track & Field" });
    await log(FACI_1, "arrived", "ignored text", "B1");
    expect((await latest(1)).other_text).toBeNull();
  });

  it("refuses text over 60 characters, a bad status and a building that is not on the list", async () => {
    expect(await fails(log(FACI_1, "other", "x".repeat(61), "A1"))).toMatch(/LOC_OTHER_TEXT_TOO_LONG/);
    expect((await log(FACI_1, "other", "x".repeat(60), "A1")).ok).toBe(true);
    expect(await fails(log(FACI_1, "teleporting", null, "A1"))).toMatch(/LOC_STATUS_INVALID/);
    expect(await fails(log(FACI_1, "arrived", null, "Z9"))).toMatch(/LOC_BUILDING_INVALID/);
    expect(await fails(log(FACI_1, "arrived", null, ""))).toMatch(/LOC_BUILDING_INVALID/);
  });

  it("every building on the map list is accepted", async () => {
    for (const b of ["A1", "A2", "A3", "A4", "A5", "B1", "Track & Field"]) {
      expect((await log(FACI_2, "heading_to", null, b)).ok).toBe(true);
    }
  });
});

describe("optional details", () => {
  it("an update can be sent with the details left out, empty or blank", async () => {
    await log(FACI_3, "arrived", null, "A1");
    expect((await latest(2)).details).toBeNull();
    await log(FACI_3, "arrived", null, "A1", null);
    expect((await latest(2)).details).toBeNull();
    await log(FACI_3, "arrived", null, "A1", "");
    expect((await latest(2)).details).toBeNull();
    await log(FACI_3, "arrived", null, "A1", "   ");
    expect((await latest(2)).details).toBeNull();
  });

  it("saves the comment (trimmed) with any status; 200 characters fit, 201 do not", async () => {
    await log(FACI_3, "heading_to", null, "A2", "  Carrying the banner  ");
    expect(await latest(2)).toMatchObject({ details: "Carrying the banner" });
    expect((await log(FACI_3, "arrived", null, "A1", "x".repeat(200))).ok).toBe(true);
    expect(await fails(log(FACI_3, "arrived", null, "A1", "x".repeat(201)))).toMatch(/LOC_DETAILS_TOO_LONG/);
  });
});

describe("who can read", () => {
  it("a Faci reads their GROUP's entries (including a colleague's), not other groups'", async () => {
    const seen = await asUser(FACI_1, "select group_id, user_id from faci_location_updates");
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((r) => r.group_id === 1)).toBe(true);
    expect(seen.some((r) => r.user_id === FACI_2)).toBe(true); // Faci Two's entry is visible to Faci One
    const other = await asUser(FACI_3, "select group_id from faci_location_updates");
    expect(other.every((r) => r.group_id === 2)).toBe(true);
  });

  it("a Faci with no group, a Freshie and a GM read none", async () => {
    expect(await asUser(FACI_NO_GROUP, "select id from faci_location_updates")).toHaveLength(0);
    expect(await asUser(FRESHIE, "select id from faci_location_updates")).toHaveLength(0);
    expect(await asUser(GM, "select id from faci_location_updates")).toHaveLength(0);
  });

  it("Admin and the committee tier read everyone's", async () => {
    const all = Number((await q("select count(*) n from faci_location_updates"))[0].n);
    expect((await asUser(ADMIN, "select id from faci_location_updates")).length).toBe(all);
    expect((await asUser(HOF, "select id from faci_location_updates")).length).toBe(all);
  });

  it("nobody can write to the table directly", async () => {
    for (const who of [FACI_1, ADMIN]) {
      expect(await fails(asUser(who, "insert into faci_location_updates (user_id, group_id, status, building) values ('" + FACI_1 + "', 1, 'arrived', 'A1')"))).toMatch(/permission denied/);
      expect(await fails(asUser(who, "update faci_location_updates set building = 'A1'"))).toMatch(/permission denied/);
      expect(await fails(asUser(who, "delete from faci_location_updates"))).toMatch(/permission denied/);
    }
  });
});

describe("Admin edits a group's latest entry", () => {
  it("changes status, building, Other text and the comment, and marks the edit", async () => {
    await log(FACI_1, "heading_to", null, "A2");
    const row = await latest(1);
    expect(row.edited_by).toBeNull();
    await edit(row.id, "other", "Waiting for the bus", "B1", "stuck in traffic");
    expect(await latest(1)).toMatchObject({ id: row.id, status: "other", other_text: "Waiting for the bus", building: "B1", details: "stuck in traffic", edited_by: ADMIN });
    expect((await latest(1)).edited_at).not.toBeNull();
    // back to a fixed status clears the typed text; an empty comment clears it too
    await edit(row.id, "arrived", "stale", "A5", "");
    expect(await latest(1)).toMatchObject({ status: "arrived", other_text: null, building: "A5", details: null });
    // leaving the comment argument out clears it
    await edit(row.id, "arrived", null, "A5", "again");
    await edit(row.id, "arrived", null, "A5");
    expect((await latest(1)).details).toBeNull();
  });

  it("records before and after in the audit log, against the group", async () => {
    const a = (await q("select target, detail from audit_log where action = 'faci_location.edit' order by id desc limit 1"))[0];
    expect(a.target).toBe("group:1");
    expect((a.detail as Row).after).toMatchObject({ status: "arrived", building: "A5" });
    const l = (await q("select target, detail from audit_log where action = 'faci_location.log' order by id desc limit 1"))[0];
    expect(String(l.target)).toMatch(/^group:/);
    expect((l.detail as Row).sent_by).toBeTruthy();
  });

  it("only the newest entry of a GROUP is editable (a colleague's newer entry makes it history)", async () => {
    const mine = await latest(1);
    await log(FACI_2, "arrived", null, "A1"); // a colleague sends a newer update
    expect(await fails(edit(mine.id, "arrived", null, "A2"))).toMatch(/LOC_NOT_LATEST/);
    const newest = await latest(1);
    expect(newest.user_id).toBe(FACI_2);
    expect((await edit(newest.id, "heading_to", null, "A2")).ok).toBe(true);
  });

  it("editing one group never touches another group", async () => {
    const g2 = await latest(2);
    const g1 = await latest(1);
    await edit(g1.id, "arrived", null, "A4");
    expect(await latest(2)).toMatchObject({ id: g2.id, building: g2.building, edited_by: g2.edited_by });
  });

  it("validates like the Faci form does", async () => {
    const id = (await latest(1)).id;
    expect(await fails(edit(id, "other", "", "A1"))).toMatch(/LOC_OTHER_TEXT_REQUIRED/);
    expect(await fails(edit(id, "other", "x".repeat(61), "A1"))).toMatch(/LOC_OTHER_TEXT_TOO_LONG/);
    expect(await fails(edit(id, "bad", null, "A1"))).toMatch(/LOC_STATUS_INVALID/);
    expect(await fails(edit(id, "arrived", null, "Z9"))).toMatch(/LOC_BUILDING_INVALID/);
    expect(await fails(edit(id, "arrived", null, "A1", "y".repeat(201)))).toMatch(/LOC_DETAILS_TOO_LONG/);
    expect(await fails(edit(999999, "arrived", null, "A1"))).toMatch(/LOC_NOT_FOUND/);
    expect(await latest(1)).toMatchObject({ building: "A4" }); // unchanged
  });

  it("only Admin can edit (not a Faci, HOF, a GM or a Freshie)", async () => {
    const id = (await latest(1)).id;
    for (const who of [FACI_1, FACI_2, HOF, GM, FRESHIE]) {
      expect(await fails(rpc(who, "fn_admin_edit_faci_location", [id, "arrived", null, "A1", "x"]))).toMatch(/PERMISSION_DENIED/);
    }
    expect(await latest(1)).toMatchObject({ building: "A4" });
  });

  it("anon cannot call either function", async () => {
    const c = await connect();
    try {
      await c.query("begin");
      await c.query("set local role anon");
      await expect(c.query("select public.fn_faci_log_location('arrived', null, 'A1')")).rejects.toThrow(/permission denied/);
    } finally {
      await c.query("rollback").catch(() => {});
      await c.end();
    }
  });
});

describe("Admin manages the location options (0076)", () => {
  const save = (who: string, id: number | null, name: string) => rpc(who, "fn_admin_location_option_save", [id, name]);
  const names = async () => (await q("select name from faci_location_options where active order by sort_order, id")).map((r) => r.name);
  const optionId = async (name: string) => Number((await q("select id from faci_location_options where name = $1 and active", [name]))[0].id);

  it("starts with the original list, readable by every signed-in role", async () => {
    expect(await names()).toEqual(["A1", "A2", "A3", "A4", "A5", "B1", "Track & Field"]);
    for (const who of [FACI_1, FRESHIE, GM, HOF, ADMIN]) {
      expect((await asUser(who, "select name from faci_location_options")).length).toBe(7);
    }
  });

  it("Admin creates a location, a Faci can pick it at once, and it goes last", async () => {
    await save(ADMIN, null, "  A6  ");
    expect((await names()).at(-1)).toBe("A6");
    expect((await log(FACI_1, "arrived", null, "A6")).ok).toBe(true);
    expect((await latest(1)).building).toBe("A6");
  });

  it("refuses a duplicate (ignoring case), an empty name and a name over 40 characters", async () => {
    expect(await fails(save(ADMIN, null, "a6"))).toMatch(/LOC_OPTION_EXISTS/);
    expect(await fails(save(ADMIN, null, "   "))).toMatch(/LOC_OPTION_NAME_INVALID/);
    expect(await fails(save(ADMIN, null, "x".repeat(41)))).toMatch(/LOC_OPTION_NAME_INVALID/);
    expect((await save(ADMIN, null, "x".repeat(40))).ok).toBe(true);
    await rpc(ADMIN, "fn_admin_location_option_delete", [await optionId("x".repeat(40))]);
  });

  it("a location that no update used is deleted for good; then Facilitators cannot pick it", async () => {
    await save(ADMIN, null, "Cafeteria");
    const id = await optionId("Cafeteria");
    expect((await rpc(ADMIN, "fn_admin_location_option_delete", [id])).archived).toBe(false);
    expect(await q("select 1 from faci_location_options where id = $1", [id])).toHaveLength(0);
    expect(await fails(log(FACI_1, "arrived", null, "Cafeteria"))).toMatch(/LOC_BUILDING_INVALID/);
  });

  it("renaming moves earlier updates to the new name too, so history stays consistent", async () => {
    await save(ADMIN, null, "Library");
    await log(FACI_3, "arrived", null, "Library");
    await log(FACI_3, "arrived", null, "A1");
    await log(FACI_3, "heading_to", null, "Library");
    const id = await optionId("Library");
    await save(ADMIN, id, "Learning Hub");
    expect(await q("select 1 from faci_location_updates where building = 'Library'")).toHaveLength(0);
    expect(Number((await q("select count(*) n from faci_location_updates where building = 'Learning Hub'"))[0].n)).toBe(2);
    expect((await log(FACI_3, "arrived", null, "Learning Hub")).ok).toBe(true);
    expect(await fails(log(FACI_3, "arrived", null, "Library"))).toMatch(/LOC_BUILDING_INVALID/);
    // renaming onto an existing name is refused
    expect(await fails(save(ADMIN, id, "A1"))).toMatch(/LOC_OPTION_EXISTS/);
    expect(await fails(save(ADMIN, 99999, "Whatever"))).toMatch(/LOC_OPTION_NOT_FOUND/);
  });

  it("deleting a location that updates already use hides it instead; those updates keep the text", async () => {
    const id = await optionId("Learning Hub");
    const r = await rpc(ADMIN, "fn_admin_location_option_delete", [id]);
    expect(r.archived).toBe(true);
    expect(await names()).not.toContain("Learning Hub");
    expect(Number((await q("select count(*) n from faci_location_updates where building = 'Learning Hub'"))[0].n)).toBe(3);
    expect(await fails(log(FACI_3, "arrived", null, "Learning Hub"))).toMatch(/LOC_BUILDING_INVALID/);
    // a new "Learning Hub" can be created again (the hidden one does not block the name)
    expect((await save(ADMIN, null, "Learning Hub")).ok).toBe(true);
  });

  it("Admin can keep an archived building on the latest update but not switch to another unknown one", async () => {
    await save(ADMIN, null, "Annex");
    await log(FACI_3, "arrived", null, "Annex");
    await rpc(ADMIN, "fn_admin_location_option_delete", [await optionId("Annex")]); // archived (used)
    const row = await latest(2);
    expect(row.building).toBe("Annex");
    expect((await edit(row.id, "heading_to", null, "Annex", "still there")).ok).toBe(true);
    expect(await fails(edit(row.id, "arrived", null, "Nowhere"))).toMatch(/LOC_BUILDING_INVALID/);
    expect((await edit(row.id, "arrived", null, "A3")).ok).toBe(true);
  });

  it("moves a location up or down, and stops at the ends", async () => {
    const before = await names();
    const idA2 = await optionId("A2");
    await rpc(ADMIN, "fn_admin_location_option_move", [idA2, -1]);
    const after = await names();
    expect(after.indexOf("A2")).toBe(before.indexOf("A2") - 1);
    await rpc(ADMIN, "fn_admin_location_option_move", [idA2, 1]);
    expect(await names()).toEqual(before);
    const first = await optionId(String(before[0]));
    expect((await rpc(ADMIN, "fn_admin_location_option_move", [first, -1])).moved).toBe(false);
    const last = await optionId(before.at(-1) as string);
    expect((await rpc(ADMIN, "fn_admin_location_option_move", [last, 1])).moved).toBe(false);
  });

  it("only Admin can create, rename, delete or move; nobody writes the table directly", async () => {
    const id = await optionId("A1");
    for (const who of [FACI_1, FACI_3, HOF, GM, FRESHIE]) {
      expect(await fails(save(who, null, "Sneaky"))).toMatch(/PERMISSION_DENIED/);
      expect(await fails(save(who, id, "Renamed"))).toMatch(/PERMISSION_DENIED/);
      expect(await fails(rpc(who, "fn_admin_location_option_delete", [id]))).toMatch(/PERMISSION_DENIED/);
      expect(await fails(rpc(who, "fn_admin_location_option_move", [id, 1]))).toMatch(/PERMISSION_DENIED/);
    }
    for (const who of [FACI_1, ADMIN]) {
      expect(await fails(asUser(who, "insert into faci_location_options (name) values ('Direct')"))).toMatch(/permission denied/);
      expect(await fails(asUser(who, "update faci_location_options set name = 'Direct'"))).toMatch(/permission denied/);
      expect(await fails(asUser(who, "delete from faci_location_options"))).toMatch(/permission denied/);
    }
    expect(await names()).toContain("A1");
  });
});
