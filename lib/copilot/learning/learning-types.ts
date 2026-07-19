// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning domain types — serializable, tenant-scoped, fail-closed

// ── Enumerations ─────────────────────────────────────────────────────────────

export type LearningEventType =
  | "HYPOTHESIS_CONFIRMED"
  | "HYPOTHESIS_REJECTED"
  | "RECOMMENDATION_ACCEPTED"
  | "RECOMMENDATION_REJECTED"
  | "ACTION_SUCCEEDED"
  | "ACTION_FAILED"
  | "USER_FEEDBACK_POSITIVE"
  | "USER_FEEDBACK_NEGATIVE"
  | "PATTERN_REINFORCED"
  | "PATTERN_WEAKENED";

export const LEARNING_EVENT_TYPES: LearningEventType[] = [
  "HYPOTHESIS_CONFIRMED",
  "HYPOTHESIS_REJECTED",
  "RECOMMENDATION_ACCEPTED",
  "RECOMMENDATION_REJECTED",
  "ACTION_SUCCEEDED",
  "ACTION_FAILED",
  "USER_FEEDBACK_POSITIVE",
  "USER_FEEDBACK_NEGATIVE",
  "PATTERN_REINFORCED",
  "PATTERN_WEAKENED",
];

export type LearningSource =
  | "COPILOT"
  | "EXECUTIVE_BRAIN"
  | "CROSS_MODULE_REASONING"
  | "MEMORY_GRAPH"
  | "PLAYBOOK"
  | "AGENT"
  | "USER"
  | "SYSTEM";

export const LEARNING_SOURCES: LearningSource[] = [
  "COPILOT",
  "EXECUTIVE_BRAIN",
  "CROSS_MODULE_REASONING",
  "MEMORY_GRAPH",
  "PLAYBOOK",
  "AGENT",
  "USER",
  "SYSTEM",
];

export type LearningConfidence = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export const LEARNING_CONFIDENCE_LEVELS: LearningConfidence[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "VERY_HIGH",
];

export type LearningDomain =
  | "FINANCE"
  | "COMMERCIAL"
  | "MARKETING"
  | "OPERATIONS"
  | "EXECUTIVE"
  | "COMPLIANCE"
  | "MEMORY"
  | "CROSS_MODULE";

export const LEARNING_DOMAINS: LearningDomain[] = [
  "FINANCE",
  "COMMERCIAL",
  "MARKETING",
  "OPERATIONS",
  "EXECUTIVE",
  "COMPLIANCE",
  "MEMORY",
  "CROSS_MODULE",
];

export type LearningPatternStatus =
  | "EMERGING"
  | "ACTIVE"
  | "REINFORCED"
  | "WEAKENED"
  | "DEPRECATED";

export const LEARNING_PATTERN_STATUSES: LearningPatternStatus[] = [
  "EMERGING",
  "ACTIVE",
  "REINFORCED",
  "WEAKENED",
  "DEPRECATED",
];

export type LearningOutcomeResult =
  | "POSITIVE"
  | "NEGATIVE"
  | "NEUTRAL"
  | "UNKNOWN";

export type LearningAdjustmentDirection = "INCREASE" | "DECREASE" | "HOLD";

export type LearningSignalStrength = "WEAK" | "MODERATE" | "STRONG" | "DEFINITIVE";

// ── Core entities ─────────────────────────────────────────────────────────────

export interface LearningEvent {
  readonly id: string;
  readonly orgSlug: string;
  readonly type: LearningEventType;
  readonly source: LearningSource;
  readonly domain: LearningDomain;
  /** Reference to the reasoning/hypothesis/recommendation that triggered this event */
  readonly referenceId: string;
  readonly referenceType: "HYPOTHESIS" | "RECOMMENDATION" | "ACTION" | "FEEDBACK" | "PATTERN";
  readonly confidence: LearningConfidence;
  readonly confidenceScore: number; // 0–1
  readonly agentId?: string;
  readonly userId?: string;
  readonly metadata: Record<string, unknown>;
  readonly occurredAt: string; // ISO8601
}

export interface LearningPattern {
  readonly id: string;
  readonly orgSlug: string;
  readonly domain: LearningDomain;
  readonly name: string;
  readonly description: string;
  readonly status: LearningPatternStatus;
  /** How many events have reinforced this pattern */
  readonly reinforcementCount: number;
  /** How many events have weakened this pattern */
  readonly weakeningCount: number;
  /** Net score: reinforcements - weakenings */
  readonly netScore: number;
  readonly confidenceScore: number; // 0–1
  readonly evidenceEventIds: string[];
  readonly agentId?: string;
  readonly metadata: Record<string, unknown>;
  readonly firstSeenAt: string; // ISO8601
  readonly lastUpdatedAt: string; // ISO8601
}

export interface LearningOutcome {
  readonly id: string;
  readonly orgSlug: string;
  readonly eventId: string;
  readonly patternId?: string;
  readonly result: LearningOutcomeResult;
  readonly domain: LearningDomain;
  readonly description: string;
  readonly impactScore: number; // 0–1
  readonly metadata: Record<string, unknown>;
  readonly evaluatedAt: string; // ISO8601
}

export interface LearningSignal {
  readonly id: string;
  readonly orgSlug: string;
  readonly eventId: string;
  readonly domain: LearningDomain;
  readonly strength: LearningSignalStrength;
  readonly direction: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  readonly description: string;
  readonly metadata: Record<string, unknown>;
  readonly generatedAt: string; // ISO8601
}

export interface LearningAdjustment {
  readonly id: string;
  readonly orgSlug: string;
  readonly patternId: string;
  readonly domain: LearningDomain;
  readonly direction: LearningAdjustmentDirection;
  readonly magnitude: number; // 0–1
  readonly rationale: string;
  /** Suggested only — never automatically applied */
  readonly applied: boolean;
  readonly appliedAt?: string; // ISO8601
  readonly metadata: Record<string, unknown>;
  readonly suggestedAt: string; // ISO8601
}

// ── Context types ─────────────────────────────────────────────────────────────

export interface LearningContext {
  readonly orgSlug: string;
  readonly domains: LearningDomain[];
  readonly recentEvents: LearningEvent[];
  readonly activePatterns: LearningPattern[];
  readonly agentId?: string;
  readonly userId?: string;
  readonly requestedAt: string; // ISO8601
}

export interface LearningApplicationContext {
  readonly orgSlug: string;
  readonly domain: LearningDomain;
  readonly patterns: LearningPattern[];
  readonly recentOutcomes: LearningOutcome[];
  readonly confidenceBoost: number; // 0–1 additive boost from learning
  readonly confidencePenalty: number; // 0–1 penalty from negative learning
}

// ── Aggregates ────────────────────────────────────────────────────────────────

export interface AgentLearningProfile {
  readonly agentId: string;
  readonly orgSlug: string;
  readonly displayName: string;
  readonly domains: LearningDomain[];
  readonly totalEvents: number;
  readonly positiveOutcomes: number;
  readonly negativeOutcomes: number;
  readonly activePatterns: number;
  readonly confidenceScore: number; // 0–1 aggregate
  readonly lastLearningAt?: string; // ISO8601
  readonly metadata: Record<string, unknown>;
}

export interface TenantLearningProfile {
  readonly orgSlug: string;
  readonly riskTolerance: "LOW" | "MEDIUM" | "HIGH";
  readonly decisionStyle: "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE";
  readonly learningMaturity: "EARLY" | "DEVELOPING" | "MATURE" | "ADVANCED";
  readonly totalEvents: number;
  readonly totalPatterns: number;
  readonly activeDomains: LearningDomain[];
  readonly confidenceScore: number; // 0–1 aggregate
  readonly lastLearningAt?: string; // ISO8601
  readonly metadata: Record<string, unknown>;
}

// ── Result type ───────────────────────────────────────────────────────────────

export interface LearningResult {
  readonly id: string;
  readonly orgSlug: string;
  readonly status: "SUCCESS" | "PARTIAL" | "FAILED";
  readonly eventsProcessed: number;
  readonly patternsUpdated: number;
  readonly signalsGenerated: number;
  readonly adjustmentsSuggested: number;
  readonly durationMs: number;
  readonly completedAt: string; // ISO8601
}
