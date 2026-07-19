// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 24: Cross-Module Reasoning Integration
// Uses ReasoningResult (NOT CrossModuleResult) from cross-module-types.ts

import type { ReasoningResult } from "../../../copilot/cross-module-reasoning/cross-module-types";

export interface CrossModuleForecastContext {
  readonly orgSlug:            string;
  readonly reasoningFindings:  string[];
  readonly reasoningRisks:     string[];
  readonly reasoningOpportunities: string[];
  readonly correlationCount:   number;
  readonly crossModuleBoost:   number; // 0–0.10
  readonly hasReasoningData:   boolean;
}

export function buildCrossModuleForecastContext(
  orgSlug: string,
  result: ReasoningResult | null
): CrossModuleForecastContext {
  try {
    if (!result || result.orgSlug !== orgSlug) {
      return buildEmptyCrossModuleForecastContext(orgSlug);
    }

    const chain             = result.chain;
    const reasoningFindings = chain.recommendations?.map((r: { title?: string }) => r.title ?? "") ?? [];
    const reasoningRisks    = chain.risks?.map((r: { title?: string }) => r.title ?? "") ?? [];
    const reasoningOpportunities = chain.opportunities?.map((o: { title?: string }) => o.title ?? "") ?? [];

    const correlationCount  = result.riskCount + result.opportunityCount;

    const crossModuleBoost = Math.min(
      0.10,
      (reasoningFindings.length > 0 ? 0.03 : 0) +
      (reasoningRisks.length > 0    ? 0.03 : 0) +
      (correlationCount > 0          ? 0.04 : 0)
    );

    return {
      orgSlug,
      reasoningFindings,
      reasoningRisks,
      reasoningOpportunities,
      correlationCount,
      crossModuleBoost,
      hasReasoningData: true,
    };
  } catch {
    return buildEmptyCrossModuleForecastContext(orgSlug);
  }
}

export function buildEmptyCrossModuleForecastContext(
  orgSlug: string
): CrossModuleForecastContext {
  return {
    orgSlug,
    reasoningFindings:       [],
    reasoningRisks:          [],
    reasoningOpportunities:  [],
    correlationCount:        0,
    crossModuleBoost:        0,
    hasReasoningData:        false,
  };
}

export function getCrossModuleForecastRiskLabels(
  ctx: CrossModuleForecastContext,
  limit = 3
): string[] {
  return ctx.reasoningRisks.slice(0, limit);
}

export function getCrossModuleForecastOpportunityLabels(
  ctx: CrossModuleForecastContext,
  limit = 3
): string[] {
  return ctx.reasoningOpportunities.slice(0, limit);
}
