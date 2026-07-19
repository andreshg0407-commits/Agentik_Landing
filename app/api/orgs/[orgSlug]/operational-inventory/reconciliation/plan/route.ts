/**
 * POST /api/orgs/[orgSlug]/operational-inventory/reconciliation/plan
 *
 * Generates a full reconciliation report + repair plan.
 * Does NOT apply any fixes.
 *
 * Body:
 *   {
 *     includeOrders?:         boolean  (default: true)
 *     includeSalesPortfolio?: boolean  (default: false)
 *   }
 *
 * Returns the full report (including all issue details) plus the complete
 * repair plan with per-action payloads.
 *
 * ─── V1 RULE ──────────────────────────────────────────────────────────────────
 * Planning only. Nothing is applied.
 * Critical issues require human approval before any fix runs.
 * The approval execution path is a future sprint.
 *
 * Sprint: AGENTIK-OPERATIONAL-INVENTORY-RECONCILIATION-01
 */

import { NextResponse }                         from "next/server";
import { requireOrgAccess }                     from "@/lib/auth/org-access";
import { runOperationalInventoryReconciliation } from "@/lib/operational-inventory/operational-reconciliation-service";

export const runtime = "nodejs";

export async function POST(
  req:    Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const body = await req.json().catch(() => ({})) as {
      includeOrders?:         boolean;
      includeSalesPortfolio?: boolean;
    };

    const { report, plan } = await runOperationalInventoryReconciliation(
      organization.id,
      {
        includeOrders:         body.includeOrders         ?? true,
        includeSalesPortfolio: body.includeSalesPortfolio ?? false,
      },
    );

    return NextResponse.json({
      ok:          true,
      report:      {
        id:          report.id,
        summary:     report.summary,
        issues:      report.issues,
        inputSummary: report.inputSummary,
        generatedAt: report.generatedAt,
      },
      plan,
    });
  } catch (err) {
    const msg    = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
