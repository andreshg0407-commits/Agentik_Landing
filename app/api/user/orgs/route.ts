/**
 * GET /api/user/orgs
 *
 * Returns all organizations the authenticated user has an ACTIVE membership in.
 * Used by TenantSwitcher to populate the tenant list client-side.
 *
 * Auth: session-based (next-auth). Returns 401 when unauthenticated.
 * No params. No pagination in Sprint 1 — acceptable for < 50 orgs.
 */

import { NextResponse }                 from "next/server";
import { getAccessibleOrganizations }   from "@/lib/auth/user-orgs";
import { getCurrentUser }               from "@/lib/auth/auth";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const orgs = await getAccessibleOrganizations();
  return NextResponse.json(orgs);
}
