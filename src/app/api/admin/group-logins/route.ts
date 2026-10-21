import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { groupLoginEmail, groupLoginPassword } from "@/lib/group-login";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CodeRow = { group_id: number; code: string; auth_user_id: string };

function explain(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const e = error as { message?: unknown; code?: unknown; status?: unknown; name?: unknown };
  const parts = [e.status, e.code, e.name, e.message].filter((part) => part != null && part !== "" && part !== "{}");
  return parts.length ? parts.map(String).join(" ") : fallback;
}

function randomCode(used: Set<string>): string {
  for (let i = 0; i < 40; i++) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
    const code = String(n).padStart(4, "0");
    if (!used.has(code)) {
      used.add(code);
      return code;
    }
  }
  throw new Error("Could not find a free 4-digit code");
}

// Creates a shared Freshie account for every group that does not have one yet.
// Groups that already have a code keep it. Accounts for deleted groups are removed.
// With { refresh: groupId }: gives that group a new password instead.
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const service = supabaseAdmin();
  const { refresh } = (await request.json().catch(() => ({}))) as { refresh?: unknown };
  if (refresh !== undefined) return refreshPassword(service, refresh);
  const { data: groups, error: groupError } = await service.from("groups").select("id, name").order("id");
  if (groupError) return NextResponse.json({ error: explain(groupError, "Could not read groups") }, { status: 500 });

  const live = new Map((groups ?? []).map((g) => [g.id as number, (g.name as string) || `Group ${g.id}`]));

  const { data: existing, error: codeError } = await service.from("group_login_codes").select("group_id, code, auth_user_id");
  if (codeError) return NextResponse.json({ error: explain(codeError, "Could not read login codes") }, { status: 500 });
  const rows = (existing ?? []) as CodeRow[];
  const byGroup = new Map(rows.map((r) => [r.group_id, r]));
  const used = new Set(rows.map((r) => r.code));

  for (const row of rows) {
    if (live.has(row.group_id)) continue;
    await service.auth.admin.deleteUser(row.auth_user_id);
    await service.from("group_login_codes").delete().eq("group_id", row.group_id);
    used.delete(row.code);
    byGroup.delete(row.group_id);
  }

  for (const [groupId, name] of live) {
    if (byGroup.has(groupId)) continue;
    const code = randomCode(used);
    const email = groupLoginEmail(groupId);
    const password = groupLoginPassword(code);

    const { data: userId, error: provisionError } = await service.rpc("fn_provision_group_login", {
      p_email: email,
      p_password: password,
      p_name: name,
      p_group_id: groupId,
    });
    if (provisionError || !userId) {
      return NextResponse.json({ error: explain(provisionError, `Could not create ${email}`) }, { status: 500 });
    }

    const { error: insertError } = await service.from("group_login_codes").insert({
      group_id: groupId,
      code,
      auth_user_id: userId,
    });
    if (insertError && !/duplicate|unique/i.test(insertError.message)) {
      return NextResponse.json({ error: explain(insertError, "Could not save the login code") }, { status: 500 });
    }
  }

  await deleteOrphanGroupUsers(service, live);

  return NextResponse.json({ ok: true });
}

// New 4-digit password for one group, then every phone signed in to the group
// is signed out (the reason to change it is that the old one leaked). The QR
// (/api/group-join) does not hold the password, so it keeps working.
async function refreshPassword(service: ReturnType<typeof supabaseAdmin>, groupId: unknown) {
  if (!Number.isInteger(groupId)) return NextResponse.json({ error: "Bad group" }, { status: 400 });
  const { data: rows, error } = await service.from("group_login_codes").select("group_id, code, auth_user_id");
  if (error) return NextResponse.json({ error: explain(error, "Could not read login codes") }, { status: 500 });
  const row = (rows as CodeRow[]).find((r) => r.group_id === groupId);
  if (!row) return NextResponse.json({ error: "This group has no login yet" }, { status: 404 });

  const code = randomCode(new Set((rows as CodeRow[]).map((r) => r.code)));
  const { error: pwError } = await service.auth.admin.updateUserById(row.auth_user_id, {
    password: groupLoginPassword(code),
  });
  if (pwError) return NextResponse.json({ error: explain(pwError, "Could not change the password") }, { status: 500 });
  const { error: saveError } = await service.from("group_login_codes").update({ code }).eq("group_id", groupId);
  if (saveError) return NextResponse.json({ error: explain(saveError, "Could not save the new password") }, { status: 500 });
  const { error: outError } = await service.rpc("fn_end_user_sessions", { p_user_id: row.auth_user_id });
  if (outError) return NextResponse.json({ error: explain(outError, "Password changed, but phones were not signed out") }, { status: 500 });
  return NextResponse.json({ ok: true, code });
}

const GROUP_EMAIL = /^group-(\d+)@freshie\.xmu\.edu\.my$/i;

async function deleteOrphanGroupUsers(
  service: ReturnType<typeof supabaseAdmin>,
  live: Map<number, string>
) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) return;
    for (const user of data.users) {
      const match = GROUP_EMAIL.exec(user.email ?? "");
      if (!match) continue;
      const groupId = Number(match[1]);
      if (live.has(groupId)) continue;
      await service.auth.admin.deleteUser(user.id);
    }
    if (data.users.length < 200) return;
  }
}
