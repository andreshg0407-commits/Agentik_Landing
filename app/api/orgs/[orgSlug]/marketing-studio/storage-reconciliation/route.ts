/**
 * app/api/orgs/[orgSlug]/marketing-studio/storage-reconciliation/route.ts
 *
 * MARKETING-ASSET-STORAGE-R2-HARDENING-03B — DB↔R2 Reconciliation
 *
 * GET — Read-only reconciliation report between DB asset records and R2 storage.
 *
 * SECURITY:
 *   - requireOrgAccess + canAccessMarketingStudio enforced.
 *   - Read-only: never modifies, deletes, or creates anything.
 *   - Scoped to the authenticated organization only.
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { canAccessMarketingStudio } from "@/lib/auth/module-access";
import { loadR2Config } from "@/lib/storage/server";
import { reconcileDbR2 } from "@/lib/storage/r2-reconciliation";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { membership, organization } = await requireOrgAccess(orgSlug);
    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Marketing Studio access required" }, { status: 403 });
    }

    const config = loadR2Config();
    if (!config) {
      return NextResponse.json({
        reconciliation: "BLOCKED",
        reason: "R2 not configured",
      });
    }

    const report = await reconcileDbR2(organization.id, config);

    return NextResponse.json({ reconciliation: "COMPLETE", report });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED") return NextResponse.json({ error: msg }, { status: 403 });
    console.error("[storage-reconciliation]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
