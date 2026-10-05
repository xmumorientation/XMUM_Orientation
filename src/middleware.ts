import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  GROUP_PASS_COOKIE,
  verifyGroupPassToken,
} from "@/lib/group-pass";

const PUBLIC_PATHS = [
  "/login",
  "/join",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
];

function denyGroupPass(request: NextRequest, reason: string, groupId?: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/group-pass/denied";
  url.search = "";
  url.searchParams.set("reason", reason);
  if (groupId) url.searchParams.set("g", groupId);
  return NextResponse.redirect(url);
}

// Session refresh + coarse auth gate. Fine-grained role checks live in the
// (app) layout and — authoritatively — in RLS/RPCs server-side (NFR-4).
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Public, backend-free routes (no Supabase). Group pages are NOT open URLs —
  // they require a signed expiring pass (see below).
  // /check-in/draw stays reachable as the backup website draw only; it must
  // not grant access to /group/* (redeem issues the pass, draw does not).
  if (
    path === "/" ||
    path.startsWith("/park") ||
    path === "/check-in/draw" ||
    path.startsWith("/check-in/draw/") ||
    path.startsWith("/group-pass") ||
    path.startsWith("/api/group-pass")
  ) {
    return NextResponse.next({ request });
  }

  // ── Group Homepage: signed pass required ─────────────────────────────
  // Blanket public short-circuit for /group* and /check-in* removed.
  if (path.startsWith("/group")) {
    const match = path.match(/^\/group\/([^/]+)\/?$/);
    const groupId = match?.[1] ? decodeURIComponent(match[1]) : null;
    if (!groupId) {
      return denyGroupPass(request, "missing");
    }

    const token = request.cookies.get(GROUP_PASS_COOKIE)?.value;
    const verified = await verifyGroupPassToken(token);
    if (!verified.ok) {
      return denyGroupPass(request, verified.reason, groupId);
    }
    if (verified.pass.g !== groupId) {
      return denyGroupPass(request, "wrong_group", groupId);
    }
    // Version/jti revoke checked in the page (Node store). Middleware
    // blocks unsigned / expired / wrong-group access.
    return NextResponse.next({ request });
  }

  // Other /check-in* paths are not blanket-public (draw is allowlisted above).
  // Fall through to normal auth gating.

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: CookieOptions;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // /activate?t=... arrives from an NFC tap — preserve it through login
    url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (user && !path.startsWith("/auth/callback")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("approved")
      .eq("id", user.id)
      .maybeSingle();
    const approved = profile?.approved !== false;
    const url = request.nextUrl.clone();
    url.search = "";

    if (!approved && path !== "/login/pending") {
      url.pathname = "/login/pending";
      return NextResponse.redirect(url);
    }
    if (approved && (path === "/login" || path === "/login/pending")) {
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/time|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
