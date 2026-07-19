// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 24: Cross-Module Reasoning Integration

import type { ReasoningResult } from "../../cross-module-reasoning/cross-module-types";

export interface CrossModuleBoardContext {
  readonly orgSlug:        string;
  readonly findings:       string[];
  readonly risks:          string[];
  readonly opportunities:  string[];
  readonly crossModuleBoost: number;
  readonly correlationCount: number;
}

export function buildCrossModuleBoardContext(
  orgSlug: string,
  result:  ReasoningResult | null
): CrossModuleBoardContext {
  try {
    if (!result || result.orgSlug !== orgSlug) {
      return buildEmptyCrossModuleBoardContext(orgSlug);
    }

    const chain         = result.chain;
    const findings      = chain.recommendations?.map((r: { title?: string }) => r.title ?? "") ?? [];
    const risks         = chain.risks?.map((r: { title?: string }) => r.title ?? "")           ?? [];
    const opportunities = chain.opportunities?.map((o: { title?: string }) => o.title ?? "")  ?? [];
    const correlationCount = result.riskCount + result.opportunityCount;

    const crossModuleBoost = Math.min(
      0.10,
      (findings.length > 0 ? 0.03 : 0) +
      (risks.length > 0    ? 0.03 : 0) +
      (correlationCount > 0 ? 0.04 : 0)
    );

    return {
      orgSlug,
      findings,
      risks,
      opportunities,
      crossModuleBoost,
      correlationCount,
    };
  } catch {
    return buildEmptyCrossModuleBoardContext(orgSlug);
  }
}

export function buildEmptyCrossModuleBoardContext(orgSlug: string): CrossModuleBoardContext {
  return {
    orgSlug,
    findings:        [],
    risks:           [],
    opportunities:   [],
    crossModuleBoost: 0,
    correlationCount: 0,
  };
}

export function getCrossModuleRiskLabels(ctx: CrossModuleBoardContext, limit = 3): string[] {
  return ctx.risks.slice(0, limit);
}

export function getCrossModuleOpportunityLabels(ctx: CrossModuleBoardContext, limit = 3): string[] {
  return ctx.opportunities.slice(0, limit);
}
