/**
 * app/api/orgs/[orgSlug]/operational-map/lineage-audit/route.ts
 *
 * Lineage Audit + Refresh API — AGENTIK-SAG-LINEAGE-RESOLUTION-02
 *
 * CRITICAL SECURITY: SUPER_ADMIN / AGENTIK_ADMIN ONLY.
 *
 * GET  — diagnostic: which SAG codes exist, which resolved, which unmatched
 * POST — { refresh: true }: refresh runtimeLineage on ALL rows (incl. protected)
 */

import { NextResponse }                from "next/server";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import { isInternalRole }              from "@/lib/auth/module-access";
import { runLineageAudit }             from "@/lib/operational-map/runtime/runtime-lineage-audit";
import { resolvePrimarySagSourceCode } from "@/lib/operational-map/runtime/runtime-source-resolution";
import { rehydrateAllRuntimeLineage }  from "@/lib/operational-map/runtime/runtime-lineage-refresher";

export const runtime = "nodejs";

async function requireInternalAccess(orgSlug: string) {
  const result = await requireOrgAccess(orgSlug);
  if (!isInternalRole(result.membership.role)) throw new Error("FORBIDDEN");
  return result;
}

// ─── GET — diagnostic ─────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireInternalAccess(params.orgSlug);
    const orgId = organization.id;

    const [audit, saleResolution, collectionResolution] = await Promise.all([
      runLineageAudit(orgId),
      resolvePrimarySagSourceCode(orgId, "SaleRecord"),
      resolvePrimarySagSourceCode(orgId, "CollectionRecord"),
    ]);

    return NextResponse.json({
      ok: true,
      audit,
      resolutions: {
        SaleRecord:       saleResolution,
        CollectionRecord: collectionResolution,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

// ─── POST — refresh runtimeLineage on all rows ────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireInternalAccess(params.orgSlug);
    const body = await req.json().catch(() => ({})) as { refresh?: boolean };

    if (!body.refresh) {
      return NextResponse.json({ ok: false, error: "Pass { refresh: true } to trigger lineage refresh" }, { status: 400 });
    }

    const refreshReport = await rehydrateAllRuntimeLineage(organization.id);

    return NextResponse.json({
      ok:   true,
      refreshReport,
    });
  } catch (err) {
    return handleError(err);
  }
}

// ─── Error handler ────────────────────────────────────────────────────────────

function handleError(err: unknown) {
  const msg    = err instanceof Error ? err.message : "Internal error";
  const status = msg === "UNAUTHENTICATED" ? 401
    : msg === "ORG_NOT_FOUND"             ? 404
    : msg === "ACCESS_DENIED" || msg === "FORBIDDEN" ? 403
    : 500;
  return NextResponse.json({ ok: false, error: msg }, { status });
}
