import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

// FR-1.1 + FR-11.1: bulk staff import via CSV with dry-run preview.
// CSV columns: name,email,role,group,station
//   role   ∈ faci|gm|guardian_gm|hof|hogm|committee|admin
//   group  = group id (optional, facis)
//   station= station id (optional, GMs)
// Returns generated credentials so Admin can distribute them centrally.

const STAFF_ROLES: UserRole[] = [
  "faci",
  "gm",
  "guardian_gm",
  "hof",
  "hogm",
  "committee",
  "admin",
];

interface CsvRow {
  line: number;
  name: string;
  email: string;
  role: string;
  group: string;
  station: string;
  error?: string;
}

// Minimal CSV parser — handles quoted fields with commas.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pw = "";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  for (const b of bytes) pw += chars[b % chars.length];
  return pw;
}

async function requireAdmin() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return profile?.role === "admin" ? user : null;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { csv, dryRun } = (await req.json()) as {
    csv: string;
    dryRun: boolean;
  };
  if (!csv || typeof csv !== "string") {
    return NextResponse.json({ error: "Missing csv" }, { status: 400 });
  }

  const raw = parseCsv(csv);
  if (raw.length === 0) {
    return NextResponse.json({ error: "Empty CSV" }, { status: 400 });
  }

  // Header row optional — detect it
  const start =
    raw[0][0]?.trim().toLowerCase() === "name" ? 1 : 0;

  const rows: CsvRow[] = raw.slice(start).map((r, i) => ({
    line: start + i + 1,
    name: (r[0] ?? "").trim(),
    email: (r[1] ?? "").trim().toLowerCase(),
    role: (r[2] ?? "").trim().toLowerCase(),
    group: (r[3] ?? "").trim(),
    station: (r[4] ?? "").trim(),
  }));

  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.name) row.error = "Missing name";
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email))
      row.error = "Invalid email";
    else if (!STAFF_ROLES.includes(row.role as UserRole))
      row.error = `Invalid role "${row.role}"`;
    else if (row.group && !/^\d+$/.test(row.group))
      row.error = "Group must be a numeric id";
    else if (row.station && !/^\d+$/.test(row.station))
      row.error = "Station must be a numeric id";
    else if (seen.has(row.email)) row.error = "Duplicate email in file";
    seen.add(row.email);
  }

  const errors = rows.filter((r) => r.error);
  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      total: rows.length,
      valid: rows.length - errors.length,
      errors: errors.map((r) => ({ line: r.line, email: r.email, error: r.error })),
      preview: rows.slice(0, 10),
    });
  }
  if (errors.length > 0) {
    return NextResponse.json(
      {
        error: "CSV has errors — run a dry run first",
        errors: errors.map((r) => ({ line: r.line, error: r.error })),
      },
      { status: 400 }
    );
  }

  const service = supabaseAdmin();
  const created: { email: string; password: string; role: string }[] = [];
  const failed: { email: string; error: string }[] = [];

  for (const row of rows) {
    const password = generatePassword();
    const { data, error } = await service.auth.admin.createUser({
      email: row.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: row.name },
      app_metadata: { role: row.role },
    });
    if (error || !data.user) {
      failed.push({ email: row.email, error: error?.message ?? "unknown" });
      continue;
    }
    // The signup trigger created the profile; set assignment fields.
    const { error: updErr } = await service
      .from("profiles")
      .update({
        role: row.role as UserRole,
        full_name: row.name,
        group_id: row.group ? Number(row.group) : null,
        station_id: row.station ? Number(row.station) : null,
      })
      .eq("id", data.user.id);
    if (updErr) {
      failed.push({ email: row.email, error: `profile: ${updErr.message}` });
      continue;
    }
    created.push({ email: row.email, password, role: row.role });
  }

  await service.from("audit_log").insert({
    actor: admin.id,
    actor_role: "admin",
    action: "users.import",
    detail: { created: created.length, failed: failed.length },
  });

  return NextResponse.json({ created, failed });
}
