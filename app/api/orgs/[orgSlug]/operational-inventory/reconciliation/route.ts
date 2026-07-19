/**
 * GET /api/orgs/[orgSlug]/operational-inventory/reconciliation
 *
 * Returns the current operational inventory reconciliation report.
 *
 * Query parameters:
 *   includeOrders=true|false         (default: true)
 *   includeSalesPortfolio=true|false (default: false)
 *
 * ─── ARCHITECTURAL RULE ───────────────────────────────────────────────────────
 * Read-only. Does NOT fix anything.
 * Does NOT touch SAG. Does NOT create fiscal documents.
 *
 * Sprint: AGENTIK-OPERATIONAL-INVENTORY-RECONCILIATION-01
 */

import { NextResponse }                         from "next/server";
import { requireOrgAccess }                     from "@/lib/auth/org-access";
import { runOperationalInventoryReconciliation } from "@/lib/operational-inventory/operational-reconciliation-service";

export const runtime = "nodejs";

export async function GET(
  req:    Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const { searchParams } = new URL(req.url);

    const includeOrders         = searchParams.get("includeOrders") !== "false";
    const includeSalesPortfolio = searchParams.get("includeSalesPortfolio") === "true";

    const { report, plan } = await runOperationalInventoryReconciliation(
      organization.id,
      { includeOrders, includeSalesPortfolio },
    );

    return NextResponse.json({
      ok:          true,
      summary:     report.summary,
      issues:      report.issues,
      inputSummary: report.inputSummary,
      generatedAt: report.generatedAt,
      reportId:    report.id,
      plan: {
        totalActions:     plan.totalActions,
        autoApplicable:   plan.autoApplicable,
        requiresApproval: plan.requiresApproval,
        noAutoFix:        plan.noAutoFix,
      },
    });
  } catch (err) {
    const msg    = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
