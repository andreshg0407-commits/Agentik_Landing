/**
 * lib/decisions/decision-types.ts
 *
 * Agentik — Decision Engine Core Types
 * Sprint: AGENTIK-DECISION-ENGINE-01
 *
 * Pure domain types. No Prisma. No React. No Next.
 * Safe to import from any layer.
 */

// ── Branded ID types ──────────────────────────────────────────────────────────

export type DecisionId             = string;
export type DecisionRunId          = string;
export type DecisionSignalId       = string;
export type DecisionRuleId         = string;
export type DecisionRecommendationId = string;

// ── Enum-like union types ─────────────────────────────────────────────────────

export type DecisionDomain =
  | "FINANCE"
  | "COLLECTIONS"
  | "COMMERCIAL"
  | "MARKETING"
  | "OPERATIONS"
  | "MANAGEMENT"
  | "SYSTEM";

export type DecisionSeverity =
  | "INFO"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export type DecisionConfidence =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "VERY_HIGH";

export type DecisionStatus =
  | "DRAFT"
  | "RECOMMENDED"
  | "DISMISSED"
  | "ACCEPTED"
  | "EXECUTED"
  | "FAILED";

export type DecisionSource =
  | "AGENT"
  | "RULE_ENGINE"
  | "USER"
  | "SYSTEM"
  | "INTEGRATION";

export type DecisionActionType =
  | "CREATE_TASK"
  | "REQUEST_APPROVAL"
  | "START_WORKFLOW"
  | "SHOW_ALERT"
  | "GENERATE_REPORT"
  | "CREATE_DOCUMENT"
  | "NO_ACTION";

// ── Actor ─────────────────────────────────────────────────────────────────────

export interface DecisionActor {
  id:    string;
  name:  string;
  type:  "AGENT" | "USER" | "SYSTEM";
  role?: string;
}

// ── Input / Output ────────────────────────────────────────────────────────────

export interface DecisionSignalRef {
  signalId:  DecisionSignalId;
  type:      string;
  domain:    DecisionDomain;
  severity:  DecisionSeverity;
}

export interface DecisionInput {
  runId:           DecisionRunId;
  domain:          DecisionDomain;
  source:          DecisionSource;
  actor:           DecisionActor;
  signals:         DecisionSignalRef[];
  contextSnapshot: Record<string, unknown>;
  requestedAt:     string;
  metadata?:       Record<string, unknown>;
}

export interface DecisionRecommendationRef {
  recommendationId: DecisionRecommendationId;
  actionType:       DecisionActionType;
  score:            number;
}

export interface DecisionOutput {
  runId:           DecisionRunId;
  domain:          DecisionDomain;
  status:          DecisionStatus;
  recommendations: DecisionRecommendationRef[];
  score:           number;
  producedAt:      string;
  metadata?:       Record<string, unknown>;
}

// ── Decision Run ──────────────────────────────────────────────────────────────

export interface DecisionRun {
  id:                  DecisionRunId;
  orgSlug:             string;
  agentId:             string;
  domain:              DecisionDomain;
  status:              DecisionStatus;
  signalCount:         number;
  recommendationCount: number;
  topScore:            number;
  auditTrail:          DecisionAuditEvent[];
  createdAt:           string;
  completedAt?:        string;
  metadata:            Record<string, unknown>;
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export type DecisionEventType =
  | "engine_started"
  | "context_validated"
  | "signals_evaluated"
  | "rule_matched"
  | "rule_skipped"
  | "recommendation_generated"
  | "recommendation_deduplicated"
  | "recommendation_dismissed"
  | "scoring_completed"
  | "engine_completed"
  | "engine_failed"
  | "validation_error"
  | "safety_limit_reached";

export interface DecisionAuditEvent {
  id:          string;
  runId:       DecisionRunId;
  event:       DecisionEventType;
  message:     string;
  metadata?:   Record<string, unknown>;
  occurredAt:  string;
}

// ── Trace ─────────────────────────────────────────────────────────────────────

export interface DecisionTrace {
  signalId:                 DecisionSignalId;
  signalType:               string;
  rulesEvaluated:           number;
  rulesMatched:             number;
  recommendationsGenerated: number;
  durationMs:               number;
}
