// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 22: Cross-Module Reasoning Integration
// CRITICAL: imports ReasoningResult from cross-module-types (see cross-module-types.ts)
// CRITICAL: accesses result.chain.recommendations, result.chain.risks
// CRITICAL: correlationCount = result.riskCount + result.opportunityCount

import type { ReasoningResult } from "../../../copilot/cross-module-reasoning/cross-module-types";

export interface GovernanceCrossModuleContext {
  readonly orgSlug:           string;
  readonly correlationCount:  number;
  readonly riskCount:         number;
  readonly opportunityCount:  number;
  readonly recommendationHints: string[];
  readonly crossModuleBoost:  number; // 0–1
  readonly hasCrossModule:    boolean;
}

export function buildGovernanceCrossModuleContext(
  orgSlug: string,
  result: ReasoningResult | null
): GovernanceCrossModuleContext {
  try {
    if (!result) {
      return { orgSlug, correlationCount: 0, riskCount: 0, opportunityCount: 0, recommendationHints: [], crossModuleBoost: 0, hasCrossModule: false };
    }
    const correlationCount   = result.riskCount + result.opportunityCount;
    const recommendationHints = (result.chain.recommendations ?? []).slice(0, 3).map((r: { title?: string; description?: string }) => r.title ?? r.description ?? "");
    const boost               = Math.min(0.10, correlationCount * 0.02);
    return {
      orgSlug,
      correlationCount,
      riskCount:           result.riskCount,
      opportunityCount:    result.opportunityCount,
      recommendationHints,
      crossModuleBoost:    boost,
      hasCrossModule:      true,
    };
  } catch {
    return { orgSlug, correlationCount: 0, riskCount: 0, opportunityCount: 0, recommendationHints: [], crossModuleBoost: 0, hasCrossModule: false };
  }
}
