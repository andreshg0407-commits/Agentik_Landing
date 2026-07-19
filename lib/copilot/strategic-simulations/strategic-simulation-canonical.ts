// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 36 — Canonical Simulation Library
// 15 canonical business simulations. All suggestedOnly: true.
// No Prisma. No server-only. Pure domain.

import type { SimulationResult, SimulationScenarioType } from "./strategic-simulation-types";
import { runSimulation } from "./strategic-simulation-engine";

export const CANONICAL_SIMULATION_TYPES: SimulationScenarioType[] = [
  "CASH_FLOW_SQUEEZE",
  "REVENUE_ACCELERATION",
  "CLIENT_CHURN",
  "MARKET_EXPANSION",
  "COST_REDUCTION",
  "RECEIVABLES_AGING",
  "COLLECTION_EFFICIENCY",
  "STRATEGIC_PIVOT",
  "REGULATORY_CHANGE",
  "COMPETITOR_ENTRY",
  "TEAM_SCALING",
  "PRODUCT_LAUNCH",
  "PARTNERSHIP_FORMATION",
  "ACQUISITION_TARGET",
  "DIGITAL_TRANSFORMATION",
];

// ── Per-type configs ──────────────────────────────────────────────────────────

interface CanonicalConfig {
  readonly category:     SimulationResult["scenarios"][0]["category"];
  readonly domain:       SimulationResult["scenarios"][0]["domain"];
  readonly variants:     SimulationResult["scenarios"][0]["variant"][];
}

const CANONICAL_CONFIG: Record<SimulationScenarioType, CanonicalConfig> = {
  CASH_FLOW_SQUEEZE:       { category: "FINANCIAL",    domain: "FINANCE",     variants: ["OPTIMISTIC", "CONSERVATIVE", "PESSIMISTIC"] },
  REVENUE_ACCELERATION:    { category: "COMMERCIAL",   domain: "COMMERCIAL",  variants: ["OPTIMISTIC", "CONSERVATIVE", "PESSIMISTIC"] },
  CLIENT_CHURN:            { category: "COMMERCIAL",   domain: "COMMERCIAL",  variants: ["CONSERVATIVE", "PESSIMISTIC"] },
  MARKET_EXPANSION:        { category: "COMMERCIAL",   domain: "COMMERCIAL",  variants: ["OPTIMISTIC", "CONSERVATIVE"] },
  COST_REDUCTION:          { category: "OPERATIONS",   domain: "OPERATIONS",  variants: ["OPTIMISTIC", "CONSERVATIVE"] },
  RECEIVABLES_AGING:       { category: "COLLECTIONS",  domain: "FINANCE",     variants: ["CONSERVATIVE", "PESSIMISTIC"] },
  COLLECTION_EFFICIENCY:   { category: "COLLECTIONS",  domain: "FINANCE",     variants: ["OPTIMISTIC", "CONSERVATIVE", "PESSIMISTIC"] },
  STRATEGIC_PIVOT:         { category: "EXECUTIVE",    domain: "EXECUTIVE",   variants: ["OPTIMISTIC", "CONSERVATIVE", "PESSIMISTIC"] },
  REGULATORY_CHANGE:       { category: "OPERATIONS",   domain: "OPERATIONS",  variants: ["CONSERVATIVE", "PESSIMISTIC"] },
  COMPETITOR_ENTRY:        { category: "COMMERCIAL",   domain: "COMMERCIAL",  variants: ["CONSERVATIVE", "PESSIMISTIC"] },
  TEAM_SCALING:            { category: "OPERATIONS",   domain: "OPERATIONS",  variants: ["OPTIMISTIC", "CONSERVATIVE"] },
  PRODUCT_LAUNCH:          { category: "MARKETING",    domain: "MARKETING",   variants: ["OPTIMISTIC", "CONSERVATIVE", "PESSIMISTIC"] },
  PARTNERSHIP_FORMATION:   { category: "COMMERCIAL",   domain: "COMMERCIAL",  variants: ["OPTIMISTIC", "CONSERVATIVE"] },
  ACQUISITION_TARGET:      { category: "FINANCIAL",    domain: "FINANCE",     variants: ["OPTIMISTIC", "CONSERVATIVE", "PESSIMISTIC"] },
  DIGITAL_TRANSFORMATION:  { category: "EXECUTIVE",    domain: "EXECUTIVE",   variants: ["OPTIMISTIC", "CONSERVATIVE", "PESSIMISTIC"] },
};

// ── Builders ──────────────────────────────────────────────────────────────────

export function buildCanonicalSimulation(
  orgSlug:  string,
  type:     SimulationScenarioType,
  metadata?: Record<string, unknown>
): SimulationResult {
  const config = CANONICAL_CONFIG[type];
  return runSimulation({
    orgSlug,
    input: {
      orgSlug,
      scenarioType: type,
      category:     config.category,
      domain:       config.domain,
      variants:     config.variants,
      metadata:     { ...metadata, canonicalType: type },
    },
  });
}

export function buildAllCanonicalSimulations(orgSlug: string): SimulationResult[] {
  return CANONICAL_SIMULATION_TYPES.map((type) => buildCanonicalSimulation(orgSlug, type));
}

export function getCanonicalSimulationByType(
  orgSlug: string,
  type:    SimulationScenarioType
): SimulationResult {
  return buildCanonicalSimulation(orgSlug, type);
}

// ── Summaries ─────────────────────────────────────────────────────────────────

export interface CanonicalSimulationSummary {
  readonly type:              SimulationScenarioType;
  readonly category:          string;
  readonly domain:            string;
  readonly variantCount:      number;
  readonly scenarioCount:     number;
  readonly avgConfidence:     number;
  readonly topRisk:           string;
  readonly topOpportunity:    string;
  readonly recommendationCount: number;
}

export function buildCanonicalSummary(
  type:   SimulationScenarioType,
  result: SimulationResult
): CanonicalSimulationSummary {
  const config         = CANONICAL_CONFIG[type];
  const allRisks       = result.scenarios.flatMap((s) => s.risks).sort((a, b) => b.compositeRisk - a.compositeRisk);
  const allOpps        = result.scenarios.flatMap((s) => s.opportunities).sort((a, b) => b.captureScore - a.captureScore);
  const avgConf        = result.scenarios.length === 0 ? 0
    : result.scenarios.reduce((s, sc) => s + sc.confidenceScore, 0) / result.scenarios.length;

  return {
    type,
    category:             config.category,
    domain:               config.domain,
    variantCount:         config.variants.length,
    scenarioCount:        result.scenarios.length,
    avgConfidence:        Math.round(avgConf * 100) / 100,
    topRisk:              allRisks[0]?.title ?? "Ninguno identificado",
    topOpportunity:       allOpps[0]?.title  ?? "Ninguna identificada",
    recommendationCount:  result.recommendations.length,
  };
}
