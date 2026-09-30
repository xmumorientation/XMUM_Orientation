import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
];

// Session refresh + coarse auth gate. Fine-grained role checks live in the
// (app) layout and — authoritatively — in RLS/RPCs server-side (NFR-4).
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Public, backend-free routes: Welcome ("/"), park prototype, and D-day
  // DEMO shells (counter draw + group Homepage). Short-circuit before
  // Supabase so they render without auth or env.
  // DEMO /check-in and /group are temporary — production needs signed/expiring
  // Homepage pass; do not treat open URLs as real access control.
  if (
    path === "/" ||
    path.startsWith("/park") ||
    path.startsWith("/check-in") ||
    path.startsWith("/group")
  ) {
    return NextResponse.next({ request });
  }

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

  if (user && (path === "/login" || path === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/time|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
