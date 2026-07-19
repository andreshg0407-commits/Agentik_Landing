// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 1: Domain Type Contracts
// Multi-tenant, fail-closed, suggestedOnly. Never executes. Never modifies systems.

// ─── Enumerations ────────────────────────────────────────────────────────────

export type DirectionConfidence =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "VERY_HIGH";

export type DirectionStatus =
  | "ALIGNED"
  | "PARTIALLY_ALIGNED"
  | "MISALIGNED"
  | "UNDER_REVIEW";

export type DirectionPriorityLevel =
  | "CRITICAL"
  | "HIGH"
  | "MEDIUM"
  | "LOW";

export type DirectionHorizon =
  | "IMMEDIATE"   // ≤30 days
  | "SHORT_TERM"  // 1–3 months
  | "MEDIUM_TERM" // 3–12 months
  | "LONG_TERM";  // 12+ months

export type DirectionDomain =
  | "GROWTH"
  | "PROFITABILITY"
  | "EFFICIENCY"
  | "INNOVATION"
  | "GOVERNANCE"
  | "RISK"
  | "TALENT"
  | "TECHNOLOGY"
  | "MARKET"
  | "OPERATIONS"
  | "CROSS_DOMAIN";

export type DirectionDeviationType =
  | "STRATEGIC_DRIFT"
  | "RESOURCE_MISALIGNMENT"
  | "PRIORITY_INVERSION"
  | "OBJECTIVE_CONFLICT"
  | "EXECUTION_GAP"
  | "MARKET_SHIFT";

export type DirectionConflictType =
  | "OBJECTIVE_CONFLICT"
  | "RESOURCE_CONFLICT"
  | "PRIORITY_CONFLICT"
  | "TIMING_CONFLICT"
  | "GOVERNANCE_CONFLICT";

export type DirectionSignalType =
  | "OPPORTUNITY"
  | "THREAT"
  | "ENABLER"
  | "INHIBITOR"
  | "INDICATOR";

export type DirectionInitiativeStatus =
  | "PROPOSED"
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";

export type DirectionHealth = "HEALTHY" | "DEGRADED" | "CRITICAL" | "EMPTY";

export type DirectionDigestPeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL";
export type DirectionBriefingType = "CEO" | "EXECUTIVE" | "BOARD" | "GROWTH" | "RISK";

// ─── North Star ───────────────────────────────────────────────────────────────

export interface NorthStar {
  readonly id:            string;
  readonly orgSlug:       string;
  readonly statement:     string; // e.g. "Expansión rentable en mercado infantil durante 18 meses"
  readonly rationale:     string;
  readonly horizon:       DirectionHorizon;
  readonly domain:        DirectionDomain;
  readonly confidence:    DirectionConfidence;
  readonly score:         number; // 0–1
  readonly evidenceIds:   string[];
  readonly assumptions:   string[];
  readonly limitations:   string[];
  readonly suggestedOnly: true;
  readonly createdAt:     string;
}

// ─── Direction Statement ──────────────────────────────────────────────────────

export interface DirectionStatement {
  readonly id:          string;
  readonly orgSlug:     string;
  readonly text:        string;
  readonly domain:      DirectionDomain;
  readonly horizon:     DirectionHorizon;
  readonly confidence:  DirectionConfidence;
  readonly evidenceIds: string[];
  readonly createdAt:   string;
}

// ─── Strategic Theme & Pillar ─────────────────────────────────────────────────

export interface StrategicTheme {
  readonly id:          string;
  readonly orgSlug:     string;
  readonly title:       string;
  readonly description: string;
  readonly domain:      DirectionDomain;
  readonly strength:    number; // 0–1
  readonly horizon:     DirectionHorizon;
  readonly isEmergent:  boolean;
  readonly evidenceIds: string[];
  readonly createdAt:   string;
}

export interface StrategicPillar {
  readonly id:          string;
  readonly orgSlug:     string;
  readonly name:        string;
  readonly description: string;
  readonly domain:      DirectionDomain;
  readonly weight:      number; // 0–1 (relative importance)
  readonly score:       number; // 0–1 (current performance)
  readonly objectives:  string[]; // objective IDs
  readonly createdAt:   string;
}

// ─── Objective ────────────────────────────────────────────────────────────────

export interface DirectionObjective {
  readonly id:            string;
  readonly orgSlug:       string;
  readonly title:         string;
  readonly description:   string;
  readonly domain:        DirectionDomain;
  readonly horizon:       DirectionHorizon;
  readonly priority:      DirectionPriorityLevel;
  readonly score:         number; // 0–1 progress
  readonly northStarId:   string;
  readonly pillarId?:     string;
  readonly evidenceIds:   string[];
  readonly assumptions:   string[];
  readonly createdAt:     string;
}

// ─── Priority ─────────────────────────────────────────────────────────────────

export interface DirectionPriority {
  readonly id:            string;
  readonly orgSlug:       string;
  readonly title:         string;
  readonly rationale:     string;
  readonly level:         DirectionPriorityLevel;
  readonly domain:        DirectionDomain;
  readonly horizon:       DirectionHorizon;
  readonly score:         number; // 0–1 urgency×impact
  readonly objectiveIds:  string[];
  readonly evidenceIds:   string[];
  readonly rank:          number;
  readonly suggestedOnly: true;
  readonly createdAt:     string;
}

// ─── Initiative ───────────────────────────────────────────────────────────────

export interface DirectionInitiative {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly title:           string;
  readonly description:     string;
  readonly domain:          DirectionDomain;
  readonly horizon:         DirectionHorizon;
  readonly status:          DirectionInitiativeStatus;
  readonly alignmentScore:  number; // 0–1 alignment with north star
  readonly priorityId?:     string;
  readonly objectiveId?:    string;
  readonly evidenceIds:     string[];
  readonly assumptions:     string[];
  readonly suggestedOnly:   true;
  readonly createdAt:       string;
}

// ─── Alignment ────────────────────────────────────────────────────────────────

export interface DirectionAlignment {
  readonly id:               string;
  readonly orgSlug:          string;
  readonly status:           DirectionStatus;
  readonly alignmentScore:   number; // 0–1
  readonly northStarScore:   number; // 0–1
  readonly pillarScores:     Record<string, number>;
  readonly gaps:             string[];
  readonly strengths:        string[];
  readonly confidence:       DirectionConfidence;
  readonly evidenceIds:      string[];
  readonly createdAt:        string;
}

// ─── Deviation ────────────────────────────────────────────────────────────────

export interface DirectionDeviation {
  readonly id:            string;
  readonly orgSlug:       string;
  readonly title:         string;
  readonly description:   string;
  readonly type:          DirectionDeviationType;
  readonly domain:        DirectionDomain;
  readonly severity:      DirectionPriorityLevel;
  readonly deviationScore: number; // 0–1 (higher = worse)
  readonly isSystemic:    boolean;
  readonly evidenceIds:   string[];
  readonly recommendations: string[];
  readonly createdAt:     string;
}

// ─── Conflict ─────────────────────────────────────────────────────────────────

export interface DirectionConflict {
  readonly id:            string;
  readonly orgSlug:       string;
  readonly title:         string;
  readonly description:   string;
  readonly type:          DirectionConflictType;
  readonly domain:        DirectionDomain;
  readonly severity:      DirectionPriorityLevel;
  readonly conflictScore: number; // 0–1
  readonly affectedIds:   string[]; // IDs of conflicting items
  readonly isBlocking:    boolean;
  readonly resolution?:   string;
  readonly createdAt:     string;
}

// ─── Direction Signal ─────────────────────────────────────────────────────────

export interface DirectionSignal {
  readonly id:           string;
  readonly orgSlug:      string;
  readonly title:        string;
  readonly description:  string;
  readonly type:         DirectionSignalType;
  readonly domain:       DirectionDomain;
  readonly intensity:    number; // 0–1
  readonly horizon:      DirectionHorizon;
  readonly evidenceIds:  string[];
  readonly createdAt:    string;
}

// ─── Recommendation ───────────────────────────────────────────────────────────

export interface DirectionRecommendation {
  readonly id:            string;
  readonly orgSlug:       string;
  readonly title:         string;
  readonly rationale:     string;
  readonly domain:        DirectionDomain;
  readonly horizon:       DirectionHorizon;
  readonly priority:      DirectionPriorityLevel;
  readonly confidence:    DirectionConfidence;
  readonly evidenceIds:   string[];
  readonly limitations:   string[];
  readonly suggestedOnly: true; // ALWAYS true — never executes
  readonly createdAt:     string;
}

// ─── Narrative ────────────────────────────────────────────────────────────────

export interface DirectionNarrative {
  readonly northStar:      string;
  readonly alignment:      string;
  readonly priorities:     string;
  readonly deviations:     string;
  readonly conflicts:      string;
  readonly opportunities:  string;
  readonly executive:      string;
  readonly limitations:    string;
}

// ─── Digest & Briefing ────────────────────────────────────────────────────────

export interface DirectionDigest {
  readonly id:             string;
  readonly orgSlug:        string;
  readonly sessionId:      string;
  readonly period:         DirectionDigestPeriod;
  readonly headline:       string;
  readonly highlights:     string[];
  readonly northStarSummary: string;
  readonly topPriorities:  string[];
  readonly watchDeviations: string[];
  readonly keyConflicts:   string[];
  readonly confidence:     DirectionConfidence;
  readonly limitations:    string[];
  readonly createdAt:      string;
}

export interface DirectionBriefing {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly type:            DirectionBriefingType;
  readonly title:           string;
  readonly summary:         string;
  readonly northStar:       string;
  readonly keyObjectives:   string[];
  readonly topPriorities:   string[];
  readonly criticalDeviations: string[];
  readonly blockingConflicts: string[];
  readonly recommendations: string[];
  readonly confidence:      DirectionConfidence;
  readonly limitations:     string[];
  readonly createdAt:       string;
}

// ─── Score ────────────────────────────────────────────────────────────────────

export interface DirectionScore {
  readonly orgSlug:             string;
  readonly overallScore:        number; // 0–1
  readonly northStarScore:      number;
  readonly alignmentScore:      number;
  readonly priorityScore:       number;
  readonly initiativeScore:     number;
  readonly deviationPenalty:    number;
  readonly conflictPenalty:     number;
  readonly confidence:          DirectionConfidence;
}

// ─── Report ───────────────────────────────────────────────────────────────────

export interface DirectionReport {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly title:           string;
  readonly northStar:       NorthStar | null;
  readonly themes:          StrategicTheme[];
  readonly pillars:         StrategicPillar[];
  readonly objectives:      DirectionObjective[];
  readonly priorities:      DirectionPriority[];
  readonly initiatives:     DirectionInitiative[];
  readonly alignment:       DirectionAlignment | null;
  readonly deviations:      DirectionDeviation[];
  readonly conflicts:       DirectionConflict[];
  readonly signals:         DirectionSignal[];
  readonly recommendations: DirectionRecommendation[];
  readonly score:           DirectionScore;
  readonly narrative:       DirectionNarrative;
  readonly digest:          DirectionDigest | null;
  readonly briefing:        DirectionBriefing | null;
  readonly limitations:     string[];
  readonly createdAt:       string;
}

// ─── Enterprise Direction ─────────────────────────────────────────────────────

export interface EnterpriseDirection {
  readonly id:           string;
  readonly orgSlug:      string;
  readonly status:       DirectionStatus;
  readonly northStar:    NorthStar | null;
  readonly score:        DirectionScore;
  readonly report:       DirectionReport;
  readonly confidence:   DirectionConfidence;
  readonly limitations:  string[];
  readonly metadata:     Record<string, unknown>;
  readonly createdAt:    string;
  readonly updatedAt:    string;
}

// ─── Pipeline I/O ─────────────────────────────────────────────────────────────

export interface EnterpriseDirectionInput {
  readonly orgSlug:    string;
  readonly sessionId:  string;
  readonly horizon?:   DirectionHorizon;
  readonly domain?:    DirectionDomain;
  readonly metadata?:  Record<string, unknown>;
}

export interface EnterpriseDirectionResult {
  readonly orgSlug:      string;
  readonly sessionId:    string;
  readonly direction:    EnterpriseDirection;
  readonly report:       DirectionReport;
  readonly score:        DirectionScore;
  readonly status:       "SUCCESS" | "PARTIAL" | "FAILED";
  readonly limitations:  string[];
  readonly errors:       string[];
  readonly createdAt:    string;
}
