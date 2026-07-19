// AGENTIK-STRATEGIC-ADVISOR-01
// Phase 1 — Strategic Advisor Domain Types
// All types are serializable (no class instances, no functions, no Date objects)

import type { StrategicMemoryDomain } from "../strategic-memory/strategic-memory-types";

// ── Shared domain type ─────────────────────────────────────────────────────────

export type StrategicDomain = StrategicMemoryDomain;

export const STRATEGIC_DOMAINS: StrategicDomain[] = [
  "FINANCE", "COMMERCIAL", "MARKETING", "OPERATIONS",
  "EXECUTIVE", "COMPLIANCE", "TECHNOLOGY", "PEOPLE", "CROSS_DOMAIN",
];

// ── Confidence & Priority ──────────────────────────────────────────────────────

export type StrategicAdviceConfidence = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
export type StrategicAdvicePriority   = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const STRATEGIC_ADVICE_CONFIDENCES: StrategicAdviceConfidence[] = ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"];
export const STRATEGIC_ADVICE_PRIORITIES:  StrategicAdvicePriority[]   = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export const STRATEGIC_CONFIDENCE_SCORE: Record<StrategicAdviceConfidence, number> = {
  LOW: 0.25, MEDIUM: 0.5, HIGH: 0.75, VERY_HIGH: 0.9,
};

export const STRATEGIC_PRIORITY_RANK: Record<StrategicAdvicePriority, number> = {
  LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4,
};

// ── Briefing & Digest periods ─────────────────────────────────────────────────

export type StrategicBriefingType = "CEO" | "BOARD" | "GROWTH" | "FINANCE" | "OPERATIONS" | "CUSTOM";
export type StrategicDigestPeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY";

export const STRATEGIC_BRIEFING_TYPES: StrategicBriefingType[] = ["CEO", "BOARD", "GROWTH", "FINANCE", "OPERATIONS", "CUSTOM"];
export const STRATEGIC_DIGEST_PERIODS:  StrategicDigestPeriod[]  = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"];

// ── Scenario types ────────────────────────────────────────────────────────────

export type StrategicScenarioType =
  | "LIQUIDITY_CRISIS"
  | "ACCELERATED_GROWTH"
  | "GROWING_RECEIVABLES"
  | "SALES_DECLINE"
  | "CLIENT_CONCENTRATION"
  | "IGNORED_OPPORTUNITY"
  | "MISALIGNED_OBJECTIVES"
  | "SUCCESSFUL_PLAYBOOK"
  | "OBSOLETE_PLAYBOOK"
  | "REGULATORY_RISK"
  | "BUSINESS_EXPANSION"
  | "STRATEGIC_CONFLICT";

export const STRATEGIC_SCENARIO_TYPES: StrategicScenarioType[] = [
  "LIQUIDITY_CRISIS", "ACCELERATED_GROWTH", "GROWING_RECEIVABLES", "SALES_DECLINE",
  "CLIENT_CONCENTRATION", "IGNORED_OPPORTUNITY", "MISALIGNED_OBJECTIVES",
  "SUCCESSFUL_PLAYBOOK", "OBSOLETE_PLAYBOOK", "REGULATORY_RISK",
  "BUSINESS_EXPANSION", "STRATEGIC_CONFLICT",
];

// ── ID generation ─────────────────────────────────────────────────────────────

let _saCounter = 0;
export function generateSaId(prefix: string): string {
  _saCounter = (_saCounter + 1) % 99999;
  return `sa_${prefix}_${Date.now().toString(36)}_${_saCounter}`;
}

// ── Core entities ─────────────────────────────────────────────────────────────

export interface StrategicConcern {
  readonly id:             string;
  readonly orgSlug:        string;
  readonly title:          string;
  readonly description:    string;
  readonly domain:         StrategicDomain;
  readonly severity:       StrategicAdvicePriority;
  readonly confidence:     StrategicAdviceConfidence;
  readonly confidenceScore: number;          // 0–1
  readonly isEmergent:     boolean;          // recently appeared
  readonly isLatent:       boolean;          // background, low visibility
  readonly rationale:      string;
  readonly evidenceIds:    string[];
  readonly relatedGoals:   string[];         // strategic goal IDs
  readonly metadata:       Record<string, unknown>;
  readonly detectedAt:     string;           // ISO string
}

export interface StrategicOpportunityAssessment {
  readonly id:             string;
  readonly orgSlug:        string;
  readonly title:          string;
  readonly description:    string;
  readonly domain:         StrategicDomain;
  readonly magnitude:      "SMALL" | "MEDIUM" | "LARGE" | "TRANSFORMATIONAL";
  readonly confidence:     StrategicAdviceConfidence;
  readonly confidenceScore: number;
  readonly captureScore:   number;           // 0–1: how actionable is it?
  readonly timeHorizon:    "IMMEDIATE" | "SHORT_TERM" | "MEDIUM_TERM" | "LONG_TERM";
  readonly isIgnored:      boolean;          // opportunity with no matching goal
  readonly rationale:      string;
  readonly evidenceIds:    string[];
  readonly metadata:       Record<string, unknown>;
}

export interface StrategicRiskAssessment {
  readonly id:             string;
  readonly orgSlug:        string;
  readonly title:          string;
  readonly description:    string;
  readonly domain:         StrategicDomain;
  readonly level:          "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  readonly confidence:     StrategicAdviceConfidence;
  readonly confidenceScore: number;
  readonly likelihood:     number;           // 0–1
  readonly impact:         number;           // 0–1
  readonly compositeRisk:  number;           // 0–1
  readonly mitigations:    string[];
  readonly rationale:      string;
  readonly evidenceIds:    string[];
  readonly metadata:       Record<string, unknown>;
}

export interface StrategicQuestion {
  readonly id:             string;
  readonly orgSlug:        string;
  readonly question:       string;
  readonly rationale:      string;           // Why this question is relevant
  readonly domain:         StrategicDomain;
  readonly priority:       StrategicAdvicePriority;
  readonly confidence:     StrategicAdviceConfidence;
  readonly category:       "RISK" | "OPPORTUNITY" | "ALIGNMENT" | "CHALLENGE" | "DECISION";
  readonly evidenceIds:    string[];
  readonly metadata:       Record<string, unknown>;
}

export interface StrategicRecommendation {
  readonly id:             string;
  readonly orgSlug:        string;
  readonly title:          string;
  readonly description:    string;
  readonly rationale:      string;
  readonly domain:         StrategicDomain;
  readonly priority:       StrategicAdvicePriority;
  readonly confidence:     StrategicAdviceConfidence;
  readonly confidenceScore: number;
  readonly expectedImpact:  string;          // Natural-language description
  readonly associatedRisks: string[];        // Risk descriptions
  readonly evidenceIds:    string[];
  readonly playbookIds:    string[];         // Related playbooks
  readonly suggestedOnly:  true;             // NEVER executes
  readonly metadata:       Record<string, unknown>;
}

export interface StrategicFocusArea {
  readonly id:             string;
  readonly orgSlug:        string;
  readonly rank:           number;
  readonly title:          string;
  readonly rationale:      string;
  readonly domain:         StrategicDomain;
  readonly urgencyScore:   number;
  readonly impactScore:    number;
  readonly compositeScore: number;
  readonly confidence:     StrategicAdviceConfidence;
  readonly evidenceIds:    string[];
  readonly metadata:       Record<string, unknown>;
}

export interface StrategicAdvice {
  readonly id:             string;
  readonly orgSlug:        string;
  readonly title:          string;
  readonly body:           string;           // Full advisory text
  readonly summary:        string;           // 1-2 sentence summary
  readonly domain:         StrategicDomain;
  readonly priority:       StrategicAdvicePriority;
  readonly confidence:     StrategicAdviceConfidence;
  readonly confidenceScore: number;
  readonly traceable:      boolean;
  readonly evidenceIds:    string[];
  readonly metadata:       Record<string, unknown>;
  readonly generatedAt:    string;           // ISO string
}

export interface StrategicDecisionContext {
  readonly orgSlug:            string;
  readonly activeGoalCount:    number;
  readonly criticalRiskCount:  number;
  readonly openConflictCount:  number;
  readonly opportunityCount:   number;
  readonly alignmentScore:     number;       // 0–1
  readonly maturityLevel:      "EARLY" | "DEVELOPING" | "MATURE" | "ADVANCED";
  readonly hasLearningData:    boolean;
  readonly hasGraphData:       boolean;
  readonly hasSignalData:      boolean;
  readonly advisorScore:       number;       // 0–1 overall health
}

// ── Scenario output ───────────────────────────────────────────────────────────

export interface StrategicScenario {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly type:            StrategicScenarioType;
  readonly title:           string;
  readonly description:     string;
  readonly concerns:        StrategicConcern[];
  readonly opportunities:   StrategicOpportunityAssessment[];
  readonly risks:           StrategicRiskAssessment[];
  readonly questions:       StrategicQuestion[];
  readonly recommendations: StrategicRecommendation[];
  readonly focusAreas:      StrategicFocusArea[];
  readonly narrative:       string;
  readonly briefingTitle:   string;
  readonly briefingSummary: string;
  readonly advisorScore:    number;
}

// ── Report & Briefing ─────────────────────────────────────────────────────────

export interface StrategicAdvisorReport {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly advisorScore:    number;
  readonly concerns:        StrategicConcern[];
  readonly opportunities:   StrategicOpportunityAssessment[];
  readonly risks:           StrategicRiskAssessment[];
  readonly questions:       StrategicQuestion[];
  readonly recommendations: StrategicRecommendation[];
  readonly focusAreas:      StrategicFocusArea[];
  readonly advice:          StrategicAdvice[];
  readonly decisionContext: StrategicDecisionContext;
  readonly alignmentScore:  number;
  readonly generatedAt:     string;
}

export interface StrategicAdvisorBriefing {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly type:            StrategicBriefingType;
  readonly title:           string;
  readonly summary:         string;
  readonly headline:        string;
  readonly topConcerns:     StrategicConcern[];
  readonly topOpportunities: StrategicOpportunityAssessment[];
  readonly topRecommendations: StrategicRecommendation[];
  readonly keyQuestions:    StrategicQuestion[];
  readonly advisorScore:    number;
  readonly confidence:      StrategicAdviceConfidence;
  readonly domains:         StrategicDomain[];
  readonly metadata:        Record<string, unknown>;
  readonly generatedAt:     string;
}

export interface StrategicAdvisorDigest {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly period:          StrategicDigestPeriod;
  readonly title:           string;
  readonly headline:        string;
  readonly topConcerns:     StrategicConcern[];
  readonly topOpportunities: StrategicOpportunityAssessment[];
  readonly topRecommendations: StrategicRecommendation[];
  readonly advisorScore:    number;
  readonly confidence:      StrategicAdviceConfidence;
  readonly metadata:        Record<string, unknown>;
  readonly generatedAt:     string;
}

// ── Main engine types ─────────────────────────────────────────────────────────

export interface StrategicAdvisorInput {
  readonly orgSlug:  string;
  readonly asOf?:    string;             // ISO date override
  readonly briefingType?: StrategicBriefingType;
  readonly digestPeriod?: StrategicDigestPeriod;
  readonly focusDomains?: StrategicDomain[];
  readonly metadata?: Record<string, unknown>;
}

export interface StrategicAdvisorQuery {
  readonly orgSlug:           string;
  readonly domains?:          StrategicDomain[];
  readonly priorities?:       StrategicAdvicePriority[];
  readonly minConfidenceScore?: number;
  readonly limit?:            number;
}

export interface StrategicAdvisorResult {
  readonly status:      "OK" | "PARTIAL" | "FAILED";
  readonly orgSlug:     string;
  readonly report:      StrategicAdvisorReport | null;
  readonly briefing:    StrategicAdvisorBriefing | null;
  readonly digest:      StrategicAdvisorDigest | null;
  readonly runId:       string;
  readonly durationMs:  number;
  readonly error?:      string;
}

export interface StrategicScenarioOutput {
  readonly scenario:    StrategicScenarioType;
  readonly orgSlug:     string;
  readonly report:      StrategicAdvisorReport;
  readonly briefing:    StrategicAdvisorBriefing;
}

// ── Utility helpers ───────────────────────────────────────────────────────────

export function confidenceSaFromScore(score: number): StrategicAdviceConfidence {
  if (score >= 0.85) return "VERY_HIGH";
  if (score >= 0.65) return "HIGH";
  if (score >= 0.40) return "MEDIUM";
  return "LOW";
}

export function prioritySaFromScore(score: number): StrategicAdvicePriority {
  if (score >= 0.85) return "CRITICAL";
  if (score >= 0.65) return "HIGH";
  if (score >= 0.40) return "MEDIUM";
  return "LOW";
}

export function sortByConcernSeverity(a: StrategicConcern, b: StrategicConcern): number {
  return STRATEGIC_PRIORITY_RANK[b.severity] - STRATEGIC_PRIORITY_RANK[a.severity];
}

export function sortByRecommendationPriority(a: StrategicRecommendation, b: StrategicRecommendation): number {
  return STRATEGIC_PRIORITY_RANK[b.priority] - STRATEGIC_PRIORITY_RANK[a.priority];
}

export function sortByCompositeOpportunity(a: StrategicOpportunityAssessment, b: StrategicOpportunityAssessment): number {
  return b.captureScore - a.captureScore;
}

export function sortByFocusScore(a: StrategicFocusArea, b: StrategicFocusArea): number {
  return b.compositeScore - a.compositeScore;
}
