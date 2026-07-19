/**
 * commercial-operational-utils.ts
 *
 * COMERCIAL-OPERATIONAL-INTEGRATION-01
 * Utility functions for the operational integration pipeline.
 *
 * No React. No UI. Pure helpers.
 */

import type { CommercialOperationalResult, ReferenceOperationalAnalysis } from "./commercial-operational-types";

// -- Filtering ---------------------------------------------------------------

/** Get only out-of-stock reference analyses. */
export function outOfStockAnalyses(result: CommercialOperationalResult): ReferenceOperationalAnalysis[] {
  return result.analyses.filter(a => a.isOutOfStock);
}

/** Get only critical (low stock, not zero) reference analyses. */
export function criticalAnalyses(result: CommercialOperationalResult): ReferenceOperationalAnalysis[] {
  return result.analyses.filter(a => a.isCritical && !a.isOutOfStock);
}

/** Get analyses that have affected orders. */
export function withAffectedOrders(result: CommercialOperationalResult): ReferenceOperationalAnalysis[] {
  return result.analyses.filter(a => a.affectedOrders.length > 0);
}

/** Get analyses that have affected vendors. */
export function withAffectedVendors(result: CommercialOperationalResult): ReferenceOperationalAnalysis[] {
  return result.analyses.filter(a => a.affectedVendors.length > 0);
}

/** Get analyses that have production in progress. */
export function withProduction(result: CommercialOperationalResult): ReferenceOperationalAnalysis[] {
  return result.analyses.filter(a => a.relatedProduction.some(p => !p.isClosed));
}

/** Get analyses that have alternative inventory available. */
export function withAlternativeInventory(result: CommercialOperationalResult): ReferenceOperationalAnalysis[] {
  return result.analyses.filter(a => a.alternativeInventory.length > 0);
}

// -- Summary -----------------------------------------------------------------

/** Build a one-line summary of pipeline results. */
export function pipelineSummary(result: CommercialOperationalResult): string {
  const parts: string[] = [];
  parts.push(`${result.totalReferencesAnalyzed} ref(s) analizadas`);
  if (result.outOfStockCount > 0) parts.push(`${result.outOfStockCount} agotadas`);
  if (result.criticalCount > 0) parts.push(`${result.criticalCount} criticas`);
  parts.push(`${result.totalSignals} señales`);
  parts.push(`${result.totalEvents} eventos`);
  parts.push(`${result.totalRecommendations} recomendaciones`);
  parts.push(`${result.processingMs}ms`);
  return parts.join(" | ");
}

/** Get all unique recommendations across all analyses, sorted by priority. */
export function allRecommendations(result: CommercialOperationalResult) {
  return result.analyses
    .flatMap(a => a.recommendations)
    .sort((a, b) => a.priority - b.priority);
}

/** Get all unique risks across all analyses, sorted by severity. */
export function allRisks(result: CommercialOperationalResult) {
  const severityOrder: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
  return result.analyses
    .flatMap(a => a.risks)
    .sort((a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0));
}
