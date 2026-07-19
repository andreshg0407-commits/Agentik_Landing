// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 23 — Compliance Gate Integration

import type { SimulationResult, SimulationRecommendation } from "../strategic-simulation-types";

export interface SimulationComplianceResult {
  readonly passed:    boolean;
  readonly violations: string[];
  readonly warnings:  string[];
}

export function evaluateSimulationComplianceGate(
  orgSlug: string,
  result:  SimulationResult
): SimulationComplianceResult {
  const violations: string[] = [];
  const warnings:   string[] = [];

  if (result.orgSlug !== orgSlug) {
    violations.push(`Tenant boundary: result orgSlug "${result.orgSlug}" does not match "${orgSlug}"`);
  }

  if (result.scenarios.some((s) => s.orgSlug !== orgSlug)) {
    violations.push("One or more scenarios belong to a different tenant");
  }

  const unsuggestedRecs = result.recommendations.filter((r) => !r.suggestedOnly);
  if (unsuggestedRecs.length > 0) {
    violations.push(`${unsuggestedRecs.length} recommendation(s) missing suggestedOnly: true`);
  }

  if (result.limitations.length === 0) {
    warnings.push("No limitations declared — simulation output may be misinterpreted as factual");
  }

  if (result.scenarios.some((s) => s.assumptions.length === 0)) {
    warnings.push("One or more scenarios have no declared assumptions");
  }

  return { passed: violations.length === 0, violations, warnings };
}

export function assertAllRecommendationsSuggestedOnly(recs: SimulationRecommendation[]): void {
  for (const r of recs) {
    if (!r.suggestedOnly) {
      throw new Error(`SimulationRecommendation "${r.title}" is missing suggestedOnly: true`);
    }
  }
}
