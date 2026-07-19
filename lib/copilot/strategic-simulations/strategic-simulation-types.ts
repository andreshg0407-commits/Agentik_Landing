// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 1 — Strategic Simulation Domain Types
// All types serializable. No class instances, no Date objects, no functions.
// Simulations are hypotheticals — never forecasts, never executed actions.

import type { StrategicDomain, StrategicAdviceConfidence, StrategicAdvicePriority } from "../strategic-advisor/strategic-advisor-types";

export type { StrategicDomain };

// ── Simulation-specific enumerations ─────────────────────────────────────────

export type SimulationConfidence = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
export type SimulationStatus     = "DRAFT" | "RUNNING" | "COMPLETED" | "FAILED";
export type SimulationCategory   = "FINANCIAL" | "COMMERCIAL" | "COLLECTIONS" | "MARKETING" | "OPERATIONS" | "EXECUTIVE" | "CUSTOM";

export const SIMULATION_CONFIDENCES: SimulationConfidence[] = ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"];
export const SIMULATION_STATUSES:    SimulationStatus[]     = ["DRAFT", "RUNNING", "COMPLETED", "FAILED"];
export const SIMULATION_CATEGORIES:  SimulationCategory[]   = ["FINANCIAL", "COMMERCIAL", "COLLECTIONS", "MARKETING", "OPERATIONS", "EXECUTIVE", "CUSTOM"];

export const SIMULATION_CONFIDENCE_SCORE: Record<SimulationConfidence, number> = {
  LOW: 0.25, MEDIUM: 0.5, HIGH: 0.75, VERY_HIGH: 0.9,
};

export const SIMULATION_CONFIDENCE_RANK: Record<SimulationConfidence, number> = {
  LOW: 1, MEDIUM: 2, HIGH: 3, VERY_HIGH: 4,
};

export type SimulationScenarioVariant = "OPTIMISTIC" | "CONSERVATIVE" | "PESSIMISTIC" | "CUSTOM";
export const SIMULATION_SCENARIO_VARIANTS: SimulationScenarioVariant[] = [
  "OPTIMISTIC", "CONSERVATIVE", "PESSIMISTIC", "CUSTOM",
];

export type SimulationImpactLevel  = "NEGLIGIBLE" | "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type SimulationRiskLevel    = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type SimulationHorizon      = "IMMEDIATE" | "SHORT_TERM" | "MEDIUM_TERM" | "LONG_TERM";

export const SIMULATION_IMPACT_LEVELS: SimulationImpactLevel[] = ["NEGLIGIBLE", "LOW", "MODERATE", "HIGH", "CRITICAL"];
export const SIMULATION_RISK_LEVELS:   SimulationRiskLevel[]   = ["LOW", "MODERATE", "HIGH", "CRITICAL"];
export const SIMULATION_HORIZONS:      SimulationHorizon[]     = ["IMMEDIATE", "SHORT_TERM", "MEDIUM_TERM", "LONG_TERM"];

// ── Canonical simulation scenario types ──────────────────────────────────────

export type SimulationScenarioType =
  | "CASH_FLOW_SQUEEZE"
  | "REVENUE_ACCELERATION"
  | "CLIENT_CHURN"
  | "MARKET_EXPANSION"
  | "COST_REDUCTION"
  | "RECEIVABLES_AGING"
  | "COLLECTION_EFFICIENCY"
  | "STRATEGIC_PIVOT"
  | "REGULATORY_CHANGE"
  | "COMPETITOR_ENTRY"
  | "TEAM_SCALING"
  | "PRODUCT_LAUNCH"
  | "PARTNERSHIP_FORMATION"
  | "ACQUISITION_TARGET"
  | "DIGITAL_TRANSFORMATION";

export const SIMULATION_SCENARIO_TYPES: SimulationScenarioType[] = [
  "CASH_FLOW_SQUEEZE", "REVENUE_ACCELERATION", "CLIENT_CHURN", "MARKET_EXPANSION",
  "COST_REDUCTION", "RECEIVABLES_AGING", "COLLECTION_EFFICIENCY", "STRATEGIC_PIVOT",
  "REGULATORY_CHANGE", "COMPETITOR_ENTRY", "TEAM_SCALING", "PRODUCT_LAUNCH",
  "PARTNERSHIP_FORMATION", "ACQUISITION_TARGET", "DIGITAL_TRANSFORMATION",
];

// ── Core building blocks ──────────────────────────────────────────────────────

export interface SimulationAssumption {
  readonly id:           string;
  readonly label:        string;
  readonly description:  string;
  readonly domain:       StrategicDomain;
  readonly confidence:   SimulationConfidence;
  readonly confidenceScore: number;           // 0–1
  readonly isKeyAssumption: boolean;          // critical path assumption
  readonly validUntil:  SimulationHorizon;
  readonly source:      "HISTORICAL" | "EXPERT" | "MARKET" | "INFERRED" | "USER";
  readonly metadata:    Record<string, unknown>;
}

export interface SimulationConstraint {
  readonly id:           string;
  readonly label:        string;
  readonly description:  string;
  readonly domain:       StrategicDomain;
  readonly type:         "HARD" | "SOFT";    // HARD = non-negotiable, SOFT = flexible
  readonly origin:       "REGULATORY" | "FINANCIAL" | "OPERATIONAL" | "STRATEGIC" | "USER";
  readonly impact:       SimulationImpactLevel;
  readonly isViolated:  boolean;
  readonly metadata:    Record<string, unknown>;
}

export interface SimulationVariable {
  readonly id:           string;
  readonly name:         string;
  readonly description:  string;
  readonly domain:       StrategicDomain;
  readonly unit:         string;             // "%" | "MXN" | "days" | "units" | etc.
  readonly baselineValue:  number;
  readonly optimisticValue: number;
  readonly pessimisticValue: number;
  readonly conservativeValue: number;
  readonly currentValue: number;
  readonly isControllable: boolean;          // can org influence this variable?
  readonly sensitivity:  "LOW" | "MEDIUM" | "HIGH"; // how much does a change move outcomes?
  readonly metadata:    Record<string, unknown>;
}

// ── Impact & Risk ─────────────────────────────────────────────────────────────

export interface SimulationImpact {
  readonly id:           string;
  readonly domain:       StrategicDomain;
  readonly label:        string;
  readonly description:  string;
  readonly level:        SimulationImpactLevel;
  readonly impactScore:  number;             // 0–1
  readonly timeHorizon:  SimulationHorizon;
  readonly isPositive:   boolean;
  readonly isReversible: boolean;
  readonly dependencies: string[];           // IDs of variables/assumptions it depends on
  readonly metadata:    Record<string, unknown>;
}

export interface SimulationRisk {
  readonly id:           string;
  readonly domain:       StrategicDomain;
  readonly title:        string;
  readonly description:  string;
  readonly level:        SimulationRiskLevel;
  readonly likelihood:   number;             // 0–1
  readonly impact:       number;             // 0–1
  readonly compositeRisk: number;            // 0–1
  readonly timeHorizon:  SimulationHorizon;
  readonly mitigations:  string[];
  readonly evidenceIds:  string[];
  readonly metadata:    Record<string, unknown>;
}

export interface SimulationOpportunity {
  readonly id:           string;
  readonly domain:       StrategicDomain;
  readonly title:        string;
  readonly description:  string;
  readonly magnitude:    "SMALL" | "MEDIUM" | "LARGE" | "TRANSFORMATIONAL";
  readonly captureScore: number;             // 0–1
  readonly confidence:   SimulationConfidence;
  readonly confidenceScore: number;          // 0–1
  readonly timeHorizon:  SimulationHorizon;
  readonly requiredActions: string[];
  readonly evidenceIds:  string[];
  readonly metadata:    Record<string, unknown>;
}

// ── Recommendation ───────────────────────────────────────────────────────────

export interface SimulationRecommendation {
  readonly id:            string;
  readonly orgSlug:       string;
  readonly title:         string;
  readonly description:   string;
  readonly rationale:     string;
  readonly domain:        StrategicDomain;
  readonly priority:      StrategicAdvicePriority;
  readonly confidence:    SimulationConfidence;
  readonly confidenceScore: number;
  readonly expectedImpact: string;
  readonly associatedRisks: string[];
  readonly evidenceIds:   string[];
  readonly scenarioId:    string;
  readonly suggestedOnly: true;              // NEVER executes
  readonly metadata:      Record<string, unknown>;
}

// ── Narrative ─────────────────────────────────────────────────────────────────

export interface SimulationNarrative {
  readonly id:          string;
  readonly title:       string;
  readonly executive:   string;             // 1-2 paragraph executive summary
  readonly keyCaution: string;             // primary risk to highlight
  readonly keyStrength: string;            // primary positive to highlight
  readonly limitations: string[];          // declared limitations
  readonly assumptions: string[];          // assumption labels in plain text
  readonly confidence:  SimulationConfidence;
  readonly domain:      StrategicDomain;
}

// ── Scenario ──────────────────────────────────────────────────────────────────

export interface SimulationScenario {
  readonly id:             string;
  readonly orgSlug:        string;
  readonly name:           string;
  readonly description:    string;
  readonly variant:        SimulationScenarioVariant;
  readonly category:       SimulationCategory;
  readonly domain:         StrategicDomain;
  readonly assumptions:    SimulationAssumption[];
  readonly constraints:    SimulationConstraint[];
  readonly variables:      SimulationVariable[];
  readonly impacts:        SimulationImpact[];
  readonly risks:          SimulationRisk[];
  readonly opportunities:  SimulationOpportunity[];
  readonly recommendations: SimulationRecommendation[];
  readonly narrative:      SimulationNarrative;
  readonly confidence:     SimulationConfidence;
  readonly confidenceScore: number;
  readonly overallRisk:    SimulationRiskLevel;
  readonly overallImpact:  SimulationImpactLevel;
  readonly metadata:       Record<string, unknown>;
  readonly simulatedAt:    string;          // ISO string
}

// ── Outcome ───────────────────────────────────────────────────────────────────

export interface SimulationOutcome {
  readonly id:             string;
  readonly orgSlug:        string;
  readonly scenarioId:     string;
  readonly title:          string;
  readonly description:    string;
  readonly category:       SimulationCategory;
  readonly domain:         StrategicDomain;
  readonly impacts:        SimulationImpact[];
  readonly risks:          SimulationRisk[];
  readonly opportunities:  SimulationOpportunity[];
  readonly overallScore:   number;          // 0–1: how favorable is this outcome?
  readonly confidence:     SimulationConfidence;
  readonly confidenceScore: number;
  readonly horizon:        SimulationHorizon;
  readonly metadata:       Record<string, unknown>;
  readonly computedAt:     string;
}

// ── Comparison ────────────────────────────────────────────────────────────────

export interface SimulationComparison {
  readonly id:             string;
  readonly orgSlug:        string;
  readonly title:          string;
  readonly description:    string;
  readonly scenarios:      SimulationScenario[];
  readonly outcomes:       SimulationOutcome[];
  readonly winner:         SimulationScenario | null;    // highest-scoring scenario
  readonly winnerRationale: string;
  readonly tradeoffs:      string[];
  readonly recommendations: SimulationRecommendation[];
  readonly confidence:     SimulationConfidence;
  readonly comparedAt:     string;
  readonly metadata:       Record<string, unknown>;
}

// ── Engine Input & Output ──────────────────────────────────────────────────────

export interface SimulationInput {
  readonly orgSlug:        string;
  readonly scenarioType?:  SimulationScenarioType;
  readonly category?:      SimulationCategory;
  readonly domain?:        StrategicDomain;
  readonly variants?:      SimulationScenarioVariant[];
  readonly userVariables?: Partial<SimulationVariable>[];
  readonly userAssumptions?: Partial<SimulationAssumption>[];
  readonly userConstraints?: Partial<SimulationConstraint>[];
  readonly focusDomain?:   StrategicDomain;
  readonly metadata?:      Record<string, unknown>;
}

export interface SimulationResult {
  readonly status:       SimulationStatus;
  readonly orgSlug:      string;
  readonly scenarios:    SimulationScenario[];
  readonly outcomes:     SimulationOutcome[];
  readonly comparison:   SimulationComparison | null;
  readonly recommendations: SimulationRecommendation[];
  readonly runId:        string;
  readonly durationMs:   number;
  readonly warnings:     string[];
  readonly limitations:  string[];
  readonly error?:       string;
}

// ── Repository shape ─────────────────────────────────────────────────────────

export interface SimulationQuery {
  readonly orgSlug:        string;
  readonly category?:      SimulationCategory;
  readonly domain?:        StrategicDomain;
  readonly status?:        SimulationStatus;
  readonly limit?:         number;
  readonly minConfidence?: SimulationConfidence;
}

export interface SimulationRecord {
  readonly id:             string;
  readonly orgSlug:        string;
  readonly category:       SimulationCategory;
  readonly domain:         StrategicDomain;
  readonly title:          string;
  readonly summary:        string;
  readonly confidence:     SimulationConfidence;
  readonly confidenceScore: number;
  readonly status:         SimulationStatus;
  readonly metadata:       Record<string, unknown>;
  readonly simulatedAt:    string;
}

// ── Utility helpers ───────────────────────────────────────────────────────────

export function simulationConfidenceFromScore(score: number): SimulationConfidence {
  if (score >= 0.85) return "VERY_HIGH";
  if (score >= 0.65) return "HIGH";
  if (score >= 0.40) return "MEDIUM";
  return "LOW";
}

export function simulationRiskLevelFromScore(score: number): SimulationRiskLevel {
  if (score >= 0.75) return "CRITICAL";
  if (score >= 0.50) return "HIGH";
  if (score >= 0.25) return "MODERATE";
  return "LOW";
}

export function simulationImpactLevelFromScore(score: number): SimulationImpactLevel {
  if (score >= 0.85) return "CRITICAL";
  if (score >= 0.65) return "HIGH";
  if (score >= 0.40) return "MODERATE";
  if (score >= 0.20) return "LOW";
  return "NEGLIGIBLE";
}

export const SIMULATION_PRIORITY_RANK: Record<StrategicAdvicePriority, number> = {
  LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4,
};
