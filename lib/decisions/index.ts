/**
 * lib/decisions/index.ts
 *
 * Agentik — Decision Engine Public Barrel
 * Sprint: AGENTIK-DECISION-ENGINE-01
 *
 * Exports all public symbols from the decision domain.
 * Nothing here is server-only — this barrel is safe to import from any layer.
 */

// Types
export type {
  DecisionId,
  DecisionRunId,
  DecisionSignalId,
  DecisionRuleId,
  DecisionRecommendationId,
  DecisionDomain,
  DecisionSeverity,
  DecisionConfidence,
  DecisionStatus,
  DecisionSource,
  DecisionActionType,
  DecisionActor,
  DecisionInput,
  DecisionSignalRef,
  DecisionRecommendationRef,
  DecisionOutput,
  DecisionRun,
  DecisionAuditEvent,
  DecisionEventType,
  DecisionTrace,
} from "./decision-types";

// Signals
export type { DecisionSignalType, DecisionSignalMetrics, DecisionSignal } from "./decision-signals";

// Context
export type {
  ActiveTaskRef,
  PendingApprovalRef,
  RecentExecutionRef,
  WorkflowRunRef,
  DecisionContext,
} from "./decision-context";

// Rules
export type { DecisionRule } from "./decision-rules";

// Scoring
export type { DecisionScoreBreakdown } from "./decision-scoring";
export { scoreDecision }               from "./decision-scoring";

// Recommendation
export type { DecisionRecommendation } from "./decision-recommendation";

// Result
export type { DecisionEngineResult, DismissedSignal } from "./decision-result";

// Audit
export type { AuditValidationResult } from "./decision-audit";
export {
  validateDecisionContext,
  validateDecisionSignal,
  validateDecisionRecommendation,
  auditDecisionRun,
  createDecisionAuditEvent,
} from "./decision-audit";

// Registry
export {
  DECISION_RULES,
  getActiveRules,
  getRulesForSignalType,
  getRulesForDomain,
} from "./decision-registry";

// Engine
export { runDecisionEngine } from "./decision-engine";

// Fixtures
export {
  financeConciliationSignal,
  financeCashflowRiskSignal,
  collectionsOverdueSignal,
  commercialMarginDropSignal,
  marketingCampaignReadySignal,
  operationsInventoryTransferSignal,
  castillitosDecisionContext,
  minimalDecisionContext,
  contextWithActiveTasks,
} from "./decision-fixtures";
