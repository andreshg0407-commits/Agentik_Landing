/**
 * GET /api/orgs/[orgSlug]/reconciliation/executions
 *
 * AGENTIK-RECON-SESSION-PERSISTENCE-01 — Phase 2+4
 * List ReconExecution records for the org (timeline data).
 *
 * Query params:
 *   sourceAType?  — filter by source A type
 *   sourceBType?  — filter by source B type
 *   period?       — filter by YYYYMM period
 *   limit?        — max results (default 20, max 100)
 *
 * Returns: { executions: ReconExecutionRow[] }
 *
 * IMPORTANT: Backend-only API route.
 */

import { NextRequest, NextResponse }  from "next/server";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { listExecutions }             from "@/lib/reconciliation/executions/execution-repository";

export async function GET(
  req:     NextRequest,
  context: { params: Promise<{ orgSlug: string }> },
): Promise<NextResponse> {
  const { orgSlug } = await context.params;

  try {
    const { organization } = await requireOrgAccess(orgSlug);
    const organizationId   = organization.id;

    const { searchParams } = req.nextUrl;
    const sourceAType = searchParams.get("sourceAType") ?? undefined;
    const sourceBType = searchParams.get("sourceBType") ?? undefined;
    const period      = searchParams.get("period")      ?? undefined;
    const rawLimit    = parseInt(searchParams.get("limit") ?? "20", 10);
    const limit       = isNaN(rawLimit) ? 20 : Math.min(Math.max(rawLimit, 1), 100);

    const executions = await listExecutions(organizationId, {
      sourceAType,
      sourceBType,
      period,
      limit,
    });

    return NextResponse.json({ executions });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    if (msg === "ACCESS_DENIED" || msg === "ORG_NOT_FOUND" || msg === "ORG_INACTIVE") {
      return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    }
    console.error("[RECON_EXECUTIONS_LIST]", msg);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
