import { NextRequest, NextResponse } from "next/server";

import { mintSignedGroupCode } from "@/lib/group-pass";
import {
  getGroupPassVersion,
  rotateGroupPassVersion,
} from "@/lib/group-pass-store";

export const dynamic = "force-dynamic";

/**
 * Rotate / revoke group codes for a group.
 * Bumps the group version so existing cookies and older codes fail.
 *
 * Auth: GROUP_PASS_ADMIN_KEY via header `x-group-pass-key` (or body.adminKey).
 * In non-production, if no key is configured, allow (local tooling only).
 *
 * POST { groupId: string, issueCode?: boolean }
 * → { groupId, version, code?: string }  (code only when issueCode true)
 */
function adminKeyOk(req: NextRequest, bodyKey: unknown): boolean {
  const expected = process.env.GROUP_PASS_ADMIN_KEY?.trim();
  if (!expected) {
    return process.env.NODE_ENV !== "production";
  }
  const header = req.headers.get("x-group-pass-key")?.trim();
  if (header && header === expected) return true;
  return typeof bodyKey === "string" && bodyKey === expected;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    groupId?: unknown;
    issueCode?: unknown;
    adminKey?: unknown;
  };

  if (!adminKeyOk(req, body.adminKey)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (typeof body.groupId !== "string" || !body.groupId.trim()) {
    return NextResponse.json(
      { error: "invalid_body", message: "Provide { groupId: string }" },
      { status: 400 }
    );
  }

  const groupId = body.groupId.trim();
  const version = rotateGroupPassVersion(groupId);

  const result: {
    ok: true;
    groupId: string;
    version: number;
    previousNote: string;
    code?: string;
  } = {
    ok: true,
    groupId,
    version,
    previousNote:
      "Old passes and lower-version codes are now invalid. Issue/print a new QR.",
  };

  if (body.issueCode === true) {
    result.code = await mintSignedGroupCode(groupId, version);
  }

  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  const groupId = req.nextUrl.searchParams.get("groupId");
  if (!groupId?.trim()) {
    return NextResponse.json(
      { error: "invalid_query", message: "Provide ?groupId=" },
      { status: 400 }
    );
  }
  // Read-only status — still gated in production
  if (!adminKeyOk(req, req.nextUrl.searchParams.get("adminKey"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    groupId: groupId.trim(),
    version: getGroupPassVersion(groupId.trim()),
  });
}
