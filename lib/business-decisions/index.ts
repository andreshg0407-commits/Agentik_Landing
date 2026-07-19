/**
 * index.ts
 *
 * BUSINESS-DECISION-ENGINE-01
 * Client-safe barrel export for the Business Decision Engine.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

// Types
export type {
  DecisionStatus,
  DecisionSource,
  DecisionPriority,
  DecisionSeverity,
  CriterionDirection,
  ConfidenceLevel,
  DecisionApprovalType,
  DecisionPolicy,
  DecisionEntityRef,
} from "./decision-types";
export { nextDecisionId, DECIDABLE_STATUSES } from "./decision-types";

// Decision
export type { BusinessDecision, DecisionTriggerRef } from "./decision";
export { buildBusinessDecision } from "./decision";

// Option
export type { DecisionOption } from "./decision-option";
export { buildDecisionOption } from "./decision-option";

// Criteria
export type { DecisionCriterion, DecisionCriterionKey } from "./decision-criteria";
export {
  buildDecisionCriterion,
  DECISION_CRITERION_KEYS,
  DEFAULT_CRITERIA_WEIGHTS,
} from "./decision-criteria";

// Justification
export type { DecisionJustification, RejectedAlternativeSummary } from "./decision-justification";
export { buildDecisionJustification } from "./decision-justification";

// Tradeoff
export type { DecisionTradeoff } from "./decision-tradeoff";
export { buildDecisionTradeoff } from "./decision-tradeoff";

// Approval
export type { DecisionApproval } from "./decision-approval";
export { buildDecisionApproval, noApprovalNeeded } from "./decision-approval";

// Confidence
export type { DecisionConfidence } from "./decision-confidence";
export { buildDecisionConfidence, confidenceLevelFromScore } from "./decision-confidence";

// Audit
export type { DecisionAudit, DecisionAuditEntry } from "./decision-audit";
export { buildDecisionAudit, addAuditEntry } from "./decision-audit";

// Context
export type { DecisionContext, DecisionEntitySnapshot } from "./decision-context";
export { buildDecisionContext } from "./decision-context";

// Engine
export type { IDecisionEngine } from "./decision-engine";
export { InMemoryDecisionEngine } from "./decision-engine";

// Registry
export type { DecisionPolicyConfig } from "./decision-registry";
export { DecisionPolicyRegistry, DEFAULT_POLICIES } from "./decision-registry";

// Utils
export {
  recommendedOption,
  rankedOptions,
  feasibleOptions,
  blockedOptions,
  decisionRequiresApproval,
  usedStrategies,
  decisionsByStatus,
  decisionsBySeverity,
  sortDecisionsBySeverity,
  countDecisionsByStatus,
  decisionSummary,
  averageOptionScore,
  recommendationGap,
} from "./decision-utils";
