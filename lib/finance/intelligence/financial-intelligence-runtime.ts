/**
 * lib/finance/intelligence/financial-intelligence-runtime.ts
 *
 * Main entry point: getFinancialIntelligenceContext(orgId)
 *
 * Orchestrates all sub-builders and returns a fully evidence-backed
 * FinancialIntelligenceContext. Every consumer (Diego, pages, copilot) uses this.
 *
 * Isolation guarantee: all queries are org-scoped. If all sources return null,
 * logs FINANCIAL_INTELLIGENCE_TENANT_ISOLATION_WARNING.
 *
 * Sprint: AGENTIK-FINANCIAL-INTELLIGENCE-LAYER-01
 */

import { buildDataFreshnessReport }    from "./financial-data-freshness";
import { buildEvidenceIndex, detectMissingEvidence } from "./financial-evidence-engine";
import {
  buildBusinessState,
  buildLiquidityState,
  buildReceivablesState,
  buildCollectionsState,
  buildBankingState,
  buildReconciliationState,
  buildCloseState,
  buildPlanningState,
  buildFinancialGraphState,
  deriveRecommendedFocusAreas,
} from "./financial-context-builder";
import { FinancialIntelligenceContext } from "./financial-intelligence-types";
import { getGraphHealthSummary }        from "@/lib/finance/graph/graph-snapshot";
import { getBankingSnapshot }           from "@/lib/finance/banking/banking-runtime";

// ── Main builder ──────────────────────────────────────────────────────────────

export async function getFinancialIntelligenceContext(
  orgId: string,
): Promise<FinancialIntelligenceContext> {
  const builtAt = new Date();

  // Step 1: freshness report — needed for evidence engine
  const dataFreshness = await buildDataFreshnessReport(orgId).catch(() => ({
    orgId,
    evaluatedAt:      builtAt,
    sources:          [],
    staleSources:     [],
    missingSources:   [],
    overallFreshness: "UNKNOWN" as const,
  }));

  // Step 2: evidence index — shared across all sub-states
  const evidenceIndex = await buildEvidenceIndex(orgId, dataFreshness).catch(() => ({}));

  // Step 3: sanity check — if all evidence is MISSING, log isolation warning
  const allMissing = Object.values(evidenceIndex).every(e => e.state === "MISSING");
  if (allMissing) {
    console.warn(
      `FINANCIAL_INTELLIGENCE_TENANT_ISOLATION_WARNING: all sources returned MISSING for org ${orgId} — tenant data may not be loaded`,
    );
  }

  // Step 4: load graph health + banking health upfront (shared by multiple builders)
  const [graphHealth, bankSnapshot] = await Promise.all([
    getGraphHealthSummary(orgId).catch(() => null),
    getBankingSnapshot(orgId).catch(() => null),
  ]);

  const graphCritical    = graphHealth?.criticalIssues   ?? 0;
  const graphUnresolved  = graphHealth?.unresolvedCount  ?? 0;
  const bankHealthStatus = bankSnapshot?.health?.level ?? "no_data";

  // Step 5: evidence slices per domain (cast to EvidenceIndex for safe key access)
  const ei = evidenceIndex as import("./financial-intelligence-types").EvidenceIndex;
  const liquidityEv      = [ei.bankAccounts,  ei.bankMovements, ei.collections].filter(Boolean);
  const receivablesEv    = [ei.receivables].filter(Boolean);
  const collectionsEv    = [ei.collections].filter(Boolean);
  const bankingEv        = [ei.bankAccounts,  ei.bankMovements].filter(Boolean);
  const reconciliationEv = [ei.bankMovements, ei.graphEdges].filter(Boolean);
  const closeEv          = [ei.bankAccounts,  ei.graphNodes].filter(Boolean);
  const planningEv       = [ei.budgets].filter(Boolean);
  const graphEv          = [ei.graphNodes,    ei.graphEdges].filter(Boolean);

  // Step 6: build all sub-states in parallel
  const [
    liquidityState,
    receivablesState,
    collectionsState,
    bankingState,
    planningState,
    financialGraphState,
  ] = await Promise.all([
    buildLiquidityState(orgId,   liquidityEv),
    buildReceivablesState(orgId, receivablesEv),
    buildCollectionsState(orgId, collectionsEv),
    buildBankingState(orgId,     bankingEv),
    buildPlanningState(orgId,    planningEv),
    buildFinancialGraphState(orgId, graphEv),
  ]);

  // Step 7: reconciliation and close depend on graph/bank data above
  const reconciliationState = await buildReconciliationState(
    orgId, reconciliationEv, graphUnresolved, graphCritical,
  );

  const closeState = await buildCloseState(
    orgId,
    closeEv,
    graphCritical,
    graphUnresolved,
    bankHealthStatus,
    reconciliationState.conciliadoPct,
  );

  // Step 8: business state (top-level health signal)
  const businessState = buildBusinessState(
    orgId,
    graphCritical,
    graphHealth?.warningIssues ?? 0,
    bankHealthStatus,
    liquidityState.cashConfidenceLevel,
  );

  // Step 9: missing evidence + focus areas
  const missingEvidence         = detectMissingEvidence(ei);
  const recommendedFocusAreas   = deriveRecommendedFocusAreas(
    financialGraphState, bankingState, reconciliationState,
    closeState, liquidityState, planningState,
  );

  return {
    orgId,
    builtAt,
    businessState,
    dataFreshness,
    financialGraphState,
    liquidityState,
    receivablesState,
    collectionsState,
    bankingState,
    reconciliationState,
    closeState,
    planningState,
    evidenceIndex: ei,
    missingEvidence,
    recommendedFocusAreas,
  };
}
