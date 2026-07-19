// AGENTIK-EXECUTIVE-BRAIN-02
// Executive Brain V2 — Domain Types
// Serializable, tenant-scoped, fail-closed. No Prisma. No server-only. No React.

import type { StrategicMemoryDomain } from "../strategic-memory/strategic-memory-types";

// ── ID generation ─────────────────────────────────────────────────────────────

let _ebv2Counter = 0;
export function generateEbv2Id(prefix: string): string {
  _ebv2Counter++;
  return `ebv2_${prefix}_${Date.now().toString(36)}_${_ebv2Counter}`;
}

// ── Enumerations ──────────────────────────────────────────────────────────────

export type ExecutiveConfidence = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export const EXECUTIVE_CONFIDENCE_LEVELS: ExecutiveConfidence[] = [
  "LOW", "MEDIUM", "HIGH", "VERY_HIGH",
];

export const EXECUTIVE_CONFIDENCE_SCORE: Record<ExecutiveConfidence, number> = {
  LOW: 0.25, MEDIUM: 0.5, HIGH: 0.75, VERY_HIGH: 0.95,
};

export type ExecutivePriorityLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const EXECUTIVE_PRIORITY_LEVELS: ExecutivePriorityLevel[] = [
  "LOW", "MEDIUM", "HIGH", "CRITICAL",
];

export const EXECUTIVE_PRIORITY_RANK: Record<ExecutivePriorityLevel, number> = {
  LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3,
};

export type ExecutiveDomain = StrategicMemoryDomain;

export const EXECUTIVE_DOMAINS: ExecutiveDomain[] = [
  "FINANCE", "COMMERCIAL", "MARKETING", "OPERATIONS",
  "EXECUTIVE", "COMPLIANCE", "TECHNOLOGY", "PEOPLE", "CROSS_DOMAIN",
];

export type ExecutiveThemeType =
  | "GROWTH"
  | "RISK_MANAGEMENT"
  | "OPERATIONAL_EXCELLENCE"
  | "FINANCIAL_HEALTH"
  | "CUSTOMER_SUCCESS"
  | "COMPLIANCE"
  | "STRATEGIC_ALIGNMENT"
  | "INNOVATION"
  | "TALENT"
  | "CROSS_DOMAIN";

export const EXECUTIVE_THEME_TYPES: ExecutiveThemeType[] = [
  "GROWTH", "RISK_MANAGEMENT", "OPERATIONAL_EXCELLENCE", "FINANCIAL_HEALTH",
  "CUSTOMER_SUCCESS", "COMPLIANCE", "STRATEGIC_ALIGNMENT", "INNOVATION",
  "TALENT", "CROSS_DOMAIN",
];

export type ExecutiveConflictType =
  | "OBJECTIVE_CONFLICT"
  | "PRIORITY_CONFLICT"
  | "RESOURCE_CONFLICT"
  | "RISK_OPPORTUNITY_TENSION"
  | "CONSTRAINT_GOAL_CONFLICT"
  | "POLICY_ACTION_CONFLICT"
  | "TEMPORAL_CONFLICT";

export const EXECUTIVE_CONFLICT_TYPES: ExecutiveConflictType[] = [
  "OBJECTIVE_CONFLICT", "PRIORITY_CONFLICT", "RESOURCE_CONFLICT",
  "RISK_OPPORTUNITY_TENSION", "CONSTRAINT_GOAL_CONFLICT",
  "POLICY_ACTION_CONFLICT", "TEMPORAL_CONFLICT",
];

export type ExecutiveRiskLevel = "NEGLIGIBLE" | "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export const EXECUTIVE_RISK_LEVELS: ExecutiveRiskLevel[] = [
  "NEGLIGIBLE", "LOW", "MODERATE", "HIGH", "CRITICAL",
];

export const EXECUTIVE_RISK_RANK: Record<ExecutiveRiskLevel, number> = {
  NEGLIGIBLE: 0, LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4,
};

export type ExecutiveOpportunityMagnitude = "SMALL" | "MEDIUM" | "LARGE" | "TRANSFORMATIONAL";

export const EXECUTIVE_OPPORTUNITY_MAGNITUDES: ExecutiveOpportunityMagnitude[] = [
  "SMALL", "MEDIUM", "LARGE", "TRANSFORMATIONAL",
];

export type ExecutiveDigestPeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY";

export const EXECUTIVE_DIGEST_PERIODS: ExecutiveDigestPeriod[] = [
  "DAILY", "WEEKLY", "MONTHLY", "QUARTERLY",
];

export type ExecutiveBriefingType = "CEO" | "FINANCE" | "COMMERCIAL" | "OPERATIONS" | "CUSTOM";

export const EXECUTIVE_BRIEFING_TYPES: ExecutiveBriefingType[] = [
  "CEO", "FINANCE", "COMMERCIAL", "OPERATIONS", "CUSTOM",
];

export type ExecutiveScenarioType =
  | "LIQUIDITY_CRISIS"
  | "ACCELERATED_GROWTH"
  | "SALES_DROP"
  | "RECEIVABLES_SURGE"
  | "REGULATORY_RISK"
  | "COMMERCIAL_OPPORTUNITY"
  | "STRATEGIC_CONFLICT"
  | "OBJECTIVE_ACHIEVED"
  | "MISALIGNED_PRIORITY"
  | "EMERGING_RISK";

export const EXECUTIVE_SCENARIO_TYPES: ExecutiveScenarioType[] = [
  "LIQUIDITY_CRISIS", "ACCELERATED_GROWTH", "SALES_DROP", "RECEIVABLES_SURGE",
  "REGULATORY_RISK", "COMMERCIAL_OPPORTUNITY", "STRATEGIC_CONFLICT",
  "OBJECTIVE_ACHIEVED", "MISALIGNED_PRIORITY", "EMERGING_RISK",
];

// ── Core domain objects ────────────────────────────────────────────────────────

export interface ExecutiveTheme {
  readonly id: string;
  readonly orgSlug: string;
  readonly type: ExecutiveThemeType;
  readonly title: string;
  readonly description: string;
  readonly domain: ExecutiveDomain;
  readonly priority: ExecutivePriorityLevel;
  readonly confidence: ExecutiveConfidence;
  readonly evidenceIds: string[];
  readonly metadata: Record<string, unknown>;
}

export interface ExecutiveObjective {
  readonly id: string;
  readonly orgSlug: string;
  readonly title: string;
  readonly description: string;
  readonly domain: ExecutiveDomain;
  readonly priority: ExecutivePriorityLevel;
  readonly confidence: ExecutiveConfidence;
  readonly confidenceScore: number;
  readonly progressScore: number;
  readonly strategicSourceId?: string;
  readonly evidenceIds: string[];
  readonly metadata: Record<string, unknown>;
}

export interface ExecutiveConcern {
  readonly id: string;
  readonly orgSlug: string;
  readonly title: string;
  readonly description: string;
  readonly domain: ExecutiveDomain;
  readonly severity: ExecutivePriorityLevel;
  readonly confidence: ExecutiveConfidence;
  readonly confidenceScore: number;
  readonly riskLevel: ExecutiveRiskLevel;
  readonly evidenceIds: string[];
  readonly metadata: Record<string, unknown>;
}

export interface ExecutiveConflict {
  readonly id: string;
  readonly orgSlug: string;
  readonly type: ExecutiveConflictType;
  readonly title: string;
  readonly description: string;
  readonly domain: ExecutiveDomain;
  readonly severity: ExecutivePriorityLevel;
  readonly confidence: ExecutiveConfidence;
  readonly elementAId: string;
  readonly elementATitle: string;
  readonly elementBId: string;
  readonly elementBTitle: string;
  readonly rationale: string;
  readonly metadata: Record<string, unknown>;
  readonly detectedAt: string;
}

export interface ExecutiveFocusArea {
  readonly id: string;
  readonly orgSlug: string;
  readonly rank: number;
  readonly title: string;
  readonly rationale: string;
  readonly domain: ExecutiveDomain;
  readonly priority: ExecutivePriorityLevel;
  readonly confidence: ExecutiveConfidence;
  readonly urgencyScore: number;
  readonly impactScore: number;
  readonly compositeScore: number;
  readonly evidenceIds: string[];
  readonly metadata: Record<string, unknown>;
}

export interface ExecutiveNarrative {
  readonly id: string;
  readonly orgSlug: string;
  readonly title: string;
  readonly body: string;
  readonly summary: string;
  readonly domain: ExecutiveDomain;
  readonly priority: ExecutivePriorityLevel;
  readonly confidence: ExecutiveConfidence;
  readonly traceable: boolean;
  readonly evidenceIds: string[];
  readonly metadata: Record<string, unknown>;
  readonly generatedAt: string;
}

export interface ExecutiveRecommendation {
  readonly id: string;
  readonly orgSlug: string;
  readonly title: string;
  readonly description: string;
  readonly rationale: string;
  readonly domain: ExecutiveDomain;
  readonly priority: ExecutivePriorityLevel;
  readonly confidence: ExecutiveConfidence;
  readonly confidenceScore: number;
  readonly impactScore: number;
  readonly urgencyScore: number;
  readonly suggestedOnly: true;
  readonly evidenceIds: string[];
  readonly metadata: Record<string, unknown>;
}

export interface ExecutivePriority {
  readonly id: string;
  readonly orgSlug: string;
  readonly rank: number;
  readonly title: string;
  readonly description: string;
  readonly domain: ExecutiveDomain;
  readonly level: ExecutivePriorityLevel;
  readonly confidence: ExecutiveConfidence;
  readonly confidenceScore: number;
  readonly impactScore: number;
  readonly urgencyScore: number;
  readonly strategicAlignmentScore: number;
  readonly historicalRiskScore: number;
  readonly priorityScore: number;
  readonly rationale: string;
  readonly evidenceIds: string[];
  readonly metadata: Record<string, unknown>;
  readonly computedAt: string;
}

export interface ExecutiveBriefing {
  readonly id: string;
  readonly orgSlug: string;
  readonly type: ExecutiveBriefingType;
  readonly title: string;
  readonly summary: string;
  readonly priorities: ExecutivePriority[];
  readonly concerns: ExecutiveConcern[];
  readonly recommendations: ExecutiveRecommendation[];
  readonly narratives: ExecutiveNarrative[];
  readonly focusAreas: ExecutiveFocusArea[];
  readonly conflicts: ExecutiveConflict[];
  readonly themes: ExecutiveTheme[];
  readonly executiveScore: number;
  readonly confidence: ExecutiveConfidence;
  readonly metadata: Record<string, unknown>;
  readonly generatedAt: string;
}

export interface ExecutiveAgendaItem {
  readonly rank: number;
  readonly title: string;
  readonly rationale: string;
  readonly domain: ExecutiveDomain;
  readonly priority: ExecutivePriorityLevel;
  readonly estimatedTimeMinutes?: number;
  readonly suggestedOnly: true;
}

export interface ExecutiveAgenda {
  readonly id: string;
  readonly orgSlug: string;
  readonly title: string;
  readonly items: ExecutiveAgendaItem[];
  readonly generatedAt: string;
  readonly metadata: Record<string, unknown>;
}

export interface ExecutiveOpportunity {
  readonly id: string;
  readonly orgSlug: string;
  readonly title: string;
  readonly description: string;
  readonly domain: ExecutiveDomain;
  readonly magnitude: ExecutiveOpportunityMagnitude;
  readonly confidence: ExecutiveConfidence;
  readonly confidenceScore: number;
  readonly captureScore: number;
  readonly rationale: string;
  readonly evidenceIds: string[];
  readonly metadata: Record<string, unknown>;
}

export interface ExecutiveRisk {
  readonly id: string;
  readonly orgSlug: string;
  readonly title: string;
  readonly description: string;
  readonly domain: ExecutiveDomain;
  readonly level: ExecutiveRiskLevel;
  readonly confidence: ExecutiveConfidence;
  readonly confidenceScore: number;
  readonly likelihood: number;
  readonly impact: number;
  readonly compositeRisk: number;
  readonly rationale: string;
  readonly evidenceIds: string[];
  readonly mitigationSuggestions: string[];
  readonly metadata: Record<string, unknown>;
}

export interface ExecutiveSituation {
  readonly orgSlug: string;
  readonly headline: string;
  readonly risks: ExecutiveRisk[];
  readonly opportunities: ExecutiveOpportunity[];
  readonly conflicts: ExecutiveConflict[];
  readonly priorities: ExecutivePriority[];
  readonly executiveScore: number;
  readonly confidence: ExecutiveConfidence;
  readonly assessedAt: string;
}

export interface ExecutiveContext {
  readonly orgSlug: string;
  readonly objectives: ExecutiveObjective[];
  readonly concerns: ExecutiveConcern[];
  readonly conflicts: ExecutiveConflict[];
  readonly focusAreas: ExecutiveFocusArea[];
  readonly priorities: ExecutivePriority[];
  readonly themes: ExecutiveTheme[];
  readonly recommendations: ExecutiveRecommendation[];
  readonly narratives: ExecutiveNarrative[];
  readonly executiveScore: number;
  readonly confidence: ExecutiveConfidence;
  readonly requestedAt: string;
}

export interface ExecutiveSnapshot {
  readonly id: string;
  readonly orgSlug: string;
  readonly context: ExecutiveContext;
  readonly briefing: ExecutiveBriefing;
  readonly agenda: ExecutiveAgenda;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
}

export interface ExecutiveDigest {
  readonly id: string;
  readonly orgSlug: string;
  readonly period: ExecutiveDigestPeriod;
  readonly title: string;
  readonly headline: string;
  readonly topPriorities: ExecutivePriority[];
  readonly topRisks: ExecutiveConcern[];
  readonly topOpportunities: ExecutiveOpportunity[];
  readonly keyNarratives: ExecutiveNarrative[];
  readonly focusAreas: ExecutiveFocusArea[];
  readonly executiveScore: number;
  readonly confidence: ExecutiveConfidence;
  readonly metadata: Record<string, unknown>;
  readonly generatedAt: string;
}

// ── Input / Result types ──────────────────────────────────────────────────────

export interface ExecutiveBrainV2Input {
  readonly orgSlug: string;
  readonly signals?: Array<{
    id: string;
    domain: string;
    severity: string;
    title: string;
    description: string;
    confidence: number;
    metadata?: Record<string, unknown>;
  }>;
  readonly metadata?: Record<string, unknown>;
}

export interface ExecutiveBrainV2Query {
  readonly orgSlug: string;
  readonly domains?: ExecutiveDomain[];
  readonly priorityLevels?: ExecutivePriorityLevel[];
  readonly minConfidenceScore?: number;
  readonly limit?: number;
}

export interface ExecutiveBrainV2Result {
  readonly id: string;
  readonly orgSlug: string;
  readonly status: "SUCCESS" | "PARTIAL" | "FAILED";
  readonly snapshot?: ExecutiveSnapshot;
  readonly prioritiesComputed: number;
  readonly risksDetected: number;
  readonly opportunitiesFound: number;
  readonly conflictsDetected: number;
  readonly durationMs: number;
  readonly completedAt: string;
}

// ── Scenario output ───────────────────────────────────────────────────────────

export interface ExecutiveScenarioOutput {
  readonly scenario: ExecutiveScenarioType;
  readonly orgSlug: string;
  readonly priorities: ExecutivePriority[];
  readonly narratives: ExecutiveNarrative[];
  readonly risks: ExecutiveRisk[];
  readonly opportunities: ExecutiveOpportunity[];
  readonly briefing: ExecutiveBriefing;
  readonly agenda: ExecutiveAgenda;
}

// ── Utility helpers ───────────────────────────────────────────────────────────

export function confidenceFromScore(score: number): ExecutiveConfidence {
  if (score >= 0.85) return "VERY_HIGH";
  if (score >= 0.65) return "HIGH";
  if (score >= 0.4) return "MEDIUM";
  return "LOW";
}

export function riskLevelFromScore(score: number): ExecutiveRiskLevel {
  if (score >= 0.85) return "CRITICAL";
  if (score >= 0.65) return "HIGH";
  if (score >= 0.4) return "MODERATE";
  if (score >= 0.2) return "LOW";
  return "NEGLIGIBLE";
}

export function opportunityMagnitudeFromScore(score: number): ExecutiveOpportunityMagnitude {
  if (score >= 0.8) return "TRANSFORMATIONAL";
  if (score >= 0.6) return "LARGE";
  if (score >= 0.35) return "MEDIUM";
  return "SMALL";
}

export function sortByPriorityLevel(
  a: { level: ExecutivePriorityLevel },
  b: { level: ExecutivePriorityLevel }
): number {
  return EXECUTIVE_PRIORITY_RANK[b.level] - EXECUTIVE_PRIORITY_RANK[a.level];
}

export function sortByPriorityScore(
  a: { priorityScore: number },
  b: { priorityScore: number }
): number {
  return b.priorityScore - a.priorityScore;
}

export function sortByCompositeScore(
  a: { compositeScore: number },
  b: { compositeScore: number }
): number {
  return b.compositeScore - a.compositeScore;
}

export function sortByCompositeRisk(
  a: { compositeRisk: number },
  b: { compositeRisk: number }
): number {
  return b.compositeRisk - a.compositeRisk;
}

export function sortByCaptureScore(
  a: { captureScore: number },
  b: { captureScore: number }
): number {
  return b.captureScore - a.captureScore;
}
