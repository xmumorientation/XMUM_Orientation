import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { generatePassword } from "@/lib/password";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

// Single-account create / edit / delete for the Admin → Users page.
// Role, group and station changes on existing accounts still go through the
// fn_admin_update_profile RPC; this route covers what the RPC cannot:
// creating the auth account, changing name / email / password, and deleting.

const STAFF_ROLES: UserRole[] = [
  "faci",
  "gm",
  "guardian_gm",
  "hof",
  "hogm",
  "committee",
  "admin",
];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Shared Freshie group logins are managed from Admin → Freshies.
const GROUP_LOGIN = /^group-\d+@freshie\.xmu\.edu\.my$/i;

const fail = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });

const idOrNull = (v: unknown) =>
  v === null || v === undefined || v === "" ? null : Number(v);

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden", 403);

  const body = (await req.json()) as {
    name?: string;
    email?: string;
    role?: string;
    group?: number | string | null;
    station?: number | string | null;
  };
  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const role = (body.role ?? "") as UserRole;
  const group = idOrNull(body.group);
  const station = idOrNull(body.station);

  if (!name) return fail("Name is required");
  if (!EMAIL.test(email)) return fail("Enter a valid email");
  if (!STAFF_ROLES.includes(role)) return fail("Choose a staff role");
  if ((group !== null && !Number.isInteger(group)) || (station !== null && !Number.isInteger(station)))
    return fail("Group and station must be ids");

  const service = supabaseAdmin();
  const password = generatePassword();
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
    app_metadata: { role },
  });
  if (error || !data.user) return fail(error?.message ?? "Could not create the account");

  // The signup trigger created the profile; set the assignment fields.
  const { error: updErr } = await service
    .from("profiles")
    .update({
      role,
      full_name: name,
      email,
      group_id: group,
      station_id: station,
      approved: true,
      requested_role: null,
    })
    .eq("id", data.user.id);
  if (updErr) {
    await service.auth.admin.deleteUser(data.user.id);
    return fail(`Profile: ${updErr.message}`, 500);
  }

  await service.from("audit_log").insert({
    actor: admin.id,
    actor_role: "admin",
    action: "users.create",
    target: `user:${data.user.id}`,
    detail: { email, role },
  });

  return NextResponse.json({ id: data.user.id, email, role, password });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden", 403);

  const body = (await req.json()) as {
    id?: string;
    name?: string;
    email?: string;
    resetPassword?: boolean;
  };
  if (!body.id) return fail("Missing id");
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  if (name !== undefined && !name) return fail("Name is required");
  if (email !== undefined && !EMAIL.test(email)) return fail("Enter a valid email");

  const service = supabaseAdmin();
  const authPatch: { email?: string; password?: string; email_confirm?: boolean } = {};
  let password: string | undefined;
  if (email !== undefined) {
    authPatch.email = email;
    authPatch.email_confirm = true;
  }
  if (body.resetPassword) {
    password = generatePassword();
    authPatch.password = password;
  }
  if (Object.keys(authPatch).length > 0) {
    const { error } = await service.auth.admin.updateUserById(body.id, authPatch);
    if (error) return fail(error.message);
  }

  const profilePatch: { full_name?: string; email?: string } = {};
  if (name !== undefined) profilePatch.full_name = name;
  if (email !== undefined) profilePatch.email = email;
  if (Object.keys(profilePatch).length > 0) {
    const { error } = await service.from("profiles").update(profilePatch).eq("id", body.id);
    if (error) return fail(error.message, 500);
  }

  await service.from("audit_log").insert({
    actor: admin.id,
    actor_role: "admin",
    action: "users.edit",
    target: `user:${body.id}`,
    detail: { name: name !== undefined, email: email !== undefined, passwordReset: !!password },
  });

  return NextResponse.json({ ok: true, password });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden", 403);

  const { id } = (await req.json()) as { id?: string };
  if (!id) return fail("Missing id");
  if (id === admin.id) return fail("You cannot delete your own account");

  const service = supabaseAdmin();
  const { data: target } = await service
    .from("profiles")
    .select("email, full_name")
    .eq("id", id)
    .maybeSingle();
  if (target?.email && GROUP_LOGIN.test(target.email))
    return fail("Group logins are managed in Admin → Freshies");

  const { error } = await service.auth.admin.deleteUser(id);
  if (error) {
    // Accounts that already recorded tokens, scans or attendance are linked
    // to that history and cannot be removed without breaking it.
    const linked = /foreign key|violates|database error/i.test(error.message);
    return fail(
      linked
        ? "This account has activity history, so it can't be deleted. Change its role instead."
        : error.message,
      linked ? 409 : 500
    );
  }

  await service.from("audit_log").insert({
    actor: admin.id,
    actor_role: "admin",
    action: "users.delete",
    target: `user:${id}`,
    detail: { email: target?.email ?? null },
  });

  return NextResponse.json({ ok: true });
}
