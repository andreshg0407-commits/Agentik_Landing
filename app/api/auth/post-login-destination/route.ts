/**
 * GET /api/auth/post-login-destination
 *
 * Sprint: AGENTIK-GLOBAL-AUTH-POST-LOGIN-LAUNCHER-01
 *
 * Returns the correct post-login destination for the authenticated user.
 * Called by the login page after successful authentication.
 *
 * Query params:
 *   callbackUrl — optional sanitized internal callback path
 *
 * Response:
 *   { destination: string, reason: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { resolvePostLoginDestination } from "@/lib/auth/post-login-destination";

export async function GET(request: NextRequest) {
  const callbackUrl = request.nextUrl.searchParams.get("callbackUrl");

  const result = await resolvePostLoginDestination(callbackUrl);

  return NextResponse.json(result);
}
