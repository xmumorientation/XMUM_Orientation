import { NextRequest, NextResponse } from "next/server";

import {
  GROUP_PASS_COOKIE,
  groupPassCookieOptions,
  groupPassTtlSeconds,
  lookupGroupCode,
  mintGroupPass,
} from "@/lib/group-pass";
import {
  ensureGroupPassVersion,
  getGroupPassVersion,
  trackPassJti,
} from "@/lib/group-pass-store";

export const dynamic = "force-dynamic";

type RedeemBody = { code?: unknown; redirect?: unknown };

/**
 * Redeem a wristband/ticket group code → httpOnly signed pass cookie.
 *
 * POST JSON { code: string, redirect?: boolean }
 * GET  ?code=...&redirect=1  (QR deep-link; redirects to /group/{id})
 *
 * Rotate semantics: code.version must be >= current group version. Redeeming
 * a higher-version code advances the group version so older passes fail.
 */
async function redeem(code: string, wantsRedirect: boolean, req: NextRequest) {
  const entry = await lookupGroupCode(code);
  if (!entry) {
    const err = {
      error: "invalid_code",
      message:
        "That code isn’t recognised. Use the wristband or ticket QR from check-in.",
    };
    if (wantsRedirect) {
      const url = req.nextUrl.clone();
      url.pathname = "/group-pass/denied";
      url.search = "reason=missing";
      return NextResponse.redirect(url);
    }
    return NextResponse.json(err, { status: 400 });
  }

  const current = getGroupPassVersion(entry.groupId);
  if (entry.version < current) {
    const err = {
      error: "code_revoked",
      message:
        "This code was replaced. Ask staff for a new wristband QR, then scan again.",
    };
    if (wantsRedirect) {
      const url = req.nextUrl.clone();
      url.pathname = "/group-pass/denied";
      url.search = "reason=rotated";
      return NextResponse.redirect(url);
    }
    return NextResponse.json(err, { status: 410 });
  }

  const version = ensureGroupPassVersion(entry.groupId, entry.version);
  const ttl = groupPassTtlSeconds();
  const { token, pass } = await mintGroupPass(entry.groupId, version, {
    ttlSeconds: ttl,
  });
  trackPassJti(entry.groupId, pass.j);

  if (wantsRedirect) {
    const url = req.nextUrl.clone();
    url.pathname = `/group/${encodeURIComponent(entry.groupId)}`;
    url.search = "";
    const res = NextResponse.redirect(url);
    res.cookies.set(GROUP_PASS_COOKIE, token, groupPassCookieOptions(ttl));
    return res;
  }

  const res = NextResponse.json({
    ok: true,
    groupId: entry.groupId,
    version,
    expiresAt: pass.e,
  });
  res.cookies.set(GROUP_PASS_COOKIE, token, groupPassCookieOptions(ttl));
  return res;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as RedeemBody;
  if (typeof body.code !== "string" || !body.code.trim()) {
    return NextResponse.json(
      { error: "invalid_body", message: "Provide { code: string }" },
      { status: 400 }
    );
  }
  const wantsRedirect = body.redirect === true || body.redirect === "1";
  return redeem(body.code, wantsRedirect, req);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code?.trim()) {
    return NextResponse.json(
      { error: "invalid_query", message: "Provide ?code=" },
      { status: 400 }
    );
  }
  // QR links default to redirect into the group page
  const redirectParam = req.nextUrl.searchParams.get("redirect");
  const wantsRedirect = redirectParam !== "0" && redirectParam !== "false";
  return redeem(code, wantsRedirect, req);
}
