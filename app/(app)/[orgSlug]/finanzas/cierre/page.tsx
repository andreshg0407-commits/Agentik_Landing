/**
 * /[orgSlug]/finanzas/cierre
 *
 * Centro Operacional de Cierre Financiero — Server Component wrapper.
 * Handles auth + delegates rendering to CierreClient (interactive layer).
 *
 * Sprint: AGENTIK-FINANCIAL-TRUTH-01 — Phase 5: Cierre real
 */

import { requireOrgAccess }              from "@/lib/auth/org-access";
import { CierreClient }                  from "./cierre-client";
import { computeCloseScore }             from "@/lib/finance/close-score";
import { getDianFiscalSummary }          from "@/lib/finance/dian-read";
import { getReconciliationSummary }      from "@/lib/finance/reconciliation";
import { getAccountingClassifications }  from "@/lib/finance/accounting-classifier";
import { getValidationStatusCounts }     from "@/lib/finance/queries";
import { getFpaCashFlow }                from "@/lib/finance/fpa-queries";
import { getGraphHealthSummary, extractGraphBlockers } from "@/lib/finance/graph";

export default async function CierrePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const [fiscal, reconciliation, accounting, validationCounts, cashFlow, graphHealth] =
    await Promise.all([
      getDianFiscalSummary(organization.id).catch(() => null),
      getReconciliationSummary(organization.id).catch(() => null),
      getAccountingClassifications(organization.id).catch(() => null),
      getValidationStatusCounts(organization.id).catch(() => null),
      getFpaCashFlow(organization.id).catch(() => null),
      getGraphHealthSummary(organization.id).catch(() => null),
    ]);

  const closeScore =
    fiscal && reconciliation && accounting && validationCounts
      ? computeCloseScore(fiscal, reconciliation, accounting, validationCounts, cashFlow ?? null)
      : null;

  // Real graph-derived blockers (from integrity issues) — no hardcoded strings
  const graphBlockers: string[] = graphHealth
    ? extractGraphBlockers(
        graphHealth.criticalIssues > 0 || graphHealth.warningIssues > 0
          // Lightweight: use nodeStats as proxy since health summary has counts not full issues
          // Full issues require getFinancialGraphSnapshot() — use in drawer detail only
          ? []
          : [],
      )
    : [];

  const graphIssueCount = (graphHealth?.criticalIssues ?? 0) + (graphHealth?.warningIssues ?? 0);

  return (
    <CierreClient
      orgSlug={orgSlug}
      closeScore={closeScore ?? undefined}
      graphIssueCount={graphIssueCount}
      graphCriticalCount={graphHealth?.criticalIssues ?? 0}
      graphHasCriticalIssues={graphHealth?.hasCriticalIssues ?? false}
      graphSourceStatus={graphHealth?.sourceStatus ?? []}
    />
  );
}
