import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Public API routes that don't require authentication
const PUBLIC_API_PATHS = [
  "/api/auth/status",
  "/api/auth/register",
  "/api/auth/login",
];

// Static resource paths that should be skipped
const STATIC_PATHS = [
  "/_next",
  "/icons",
  "/locales",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/sw.js",
];

// Auth pages that don't require session
const AUTH_PAGES = ["/login", "/setup"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static resources
  if (STATIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow public API routes
  if (PUBLIC_API_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow auth pages
  if (AUTH_PAGES.some((p) => pathname === p)) {
    return NextResponse.next();
  }

  // Check session cookie for protected routes
  const session = request.cookies.get("gist_session");

  if (!session?.value) {
    // API requests return 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Page requests are handled by AuthProvider on client side
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
