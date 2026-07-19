/**
 * middleware.ts
 *
 * Injects the current request pathname as `x-invoke-path` so that
 * server components (layout.tsx) can read it via headers().get("x-invoke-path").
 *
 * Without this, headers().get("x-invoke-path") returns "" and the agent
 * resolver falls back to Pablo for every route.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
