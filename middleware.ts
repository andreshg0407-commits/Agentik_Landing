/**
 * middleware.ts
 *
 * 1. Auth guard: unauthenticated requests to protected /[orgSlug]/* routes
 *    redirect to /login?callbackUrl=<original path> instead of 500.
 * 2. Injects `x-invoke-path` header for server component pathname resolution.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that do NOT require authentication
const PUBLIC_PATHS = new Set(["/", "/login", "/login/setup", "/privacy", "/unauthorized", "/terms"]);

// Path prefixes that do NOT require authentication
const PUBLIC_PREFIXES = ["/api/", "/c/", "/control-center", "/publish", "/review", "/sandbox-"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

function hasSessionCookie(request: NextRequest): boolean {
  // NextAuth JWT session cookie names:
  // - HTTPS: __Secure-next-auth.session-token
  // - HTTP:  next-auth.session-token
  return (
    request.cookies.has("__Secure-next-auth.session-token") ||
    request.cookies.has("next-auth.session-token")
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Auth guard: redirect unauthenticated users to login with callback
  if (!isPublicPath(pathname) && !hasSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    // Preserve original path + query string for post-login redirect
    const search = request.nextUrl.search;
    loginUrl.searchParams.set("callbackUrl", search ? `${pathname}${search}` : pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Must set on the REQUEST headers so server components can read via headers().
  // Setting on response headers does NOT make them available to RSC via headers().
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-invoke-path", pathname);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  // Run on all app routes — skip static assets and Next internals
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|agentik-.*\\.png|agentik-.*\\.svg|.*\\.ico).*)",
  ],
};
