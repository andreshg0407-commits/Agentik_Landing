// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 28: Cross-Module Integration
// CRITICAL: imports ReasoningResult NOT CrossModuleResult
// accesses result.chain.recommendations, result.chain.risks, result.chain.opportunities

import type { ReasoningResult } from "../../../copilot/cross-module-reasoning/cross-module-types";

export interface DirectionCrossModuleContext {
  readonly orgSlug:           string;
  readonly correlationCount:  number;
  readonly crossModuleBoost:  number; // 0–0.10
  readonly hasReasoningData:  boolean;
}

export function buildDirectionCrossModuleContext(
  orgSlug: string,
  result: ReasoningResult | null
): DirectionCrossModuleContext {
  try {
    if (!result) {
      return { orgSlug, correlationCount: 0, crossModuleBoost: 0, hasReasoningData: false };
    }
    // correlationCount = riskCount + opportunityCount
    const correlationCount = result.riskCount + result.opportunityCount;
    const boost = Math.min(0.10, correlationCount * 0.015);
    return {
      orgSlug,
      correlationCount,
      crossModuleBoost: boost,
      hasReasoningData: true,
    };
  } catch {
    return { orgSlug, correlationCount: 0, crossModuleBoost: 0, hasReasoningData: false };
  }
}

export function extractDirectionRecommendationTitles(result: ReasoningResult | null): string[] {
  try {
    if (!result?.chain?.recommendations) return [];
    return result.chain.recommendations.map((r) => r.title ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

export function extractDirectionRiskTitles(result: ReasoningResult | null): string[] {
  try {
    if (!result?.chain?.risks) return [];
    return result.chain.risks.map((r) => r.title ?? "").filter(Boolean);
  } catch {
    return [];
  }
}
