/**
 * lib/autonomous-operations/index.ts
 *
 * Agentik — Autonomous Operations Public Barrel
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * CLIENT-SAFE — exports pure domain only.
 * Server layer: import from ./server/server.ts
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type {
  AutonomousOperationId,
  AutonomousOperationRunId,
  AutonomousOperationPlanId,
  AutonomousOperationPolicyId,
  AutonomousOperationStatus,
  AutonomousOperationMode,
  AutonomousOperationRiskLevel,
  AutonomousOperationDecision,
  AutonomousOperationSource,
  AutonomousOperationTarget,
  AutonomousOperationActor,
  AutonomousOperationInput,
  TaskDraft,
  ApprovalDraft,
  WorkflowDraft,
  EscalationPayload,
  AutonomousOperationEventType,
  AutonomousOperationAuditEvent,
  AutonomousOperationPlan,
} from "./autonomous-operation-types";

export type { AutonomousOperationPolicy } from "./autonomous-operation-policy";
export { AUTONOMOUS_OPERATION_POLICIES }  from "./autonomous-operation-policy";

export type { GuardrailEvaluationResult } from "./autonomous-operation-guardrails";
export {
  evaluateAutonomousGuardrails,
  calculateRiskLevel,
} from "./autonomous-operation-guardrails";

export {
  resolveOperationPolicy,
  getPoliciesByDomain,
  getPolicyForAction,
  isCriticalOperation,
} from "./autonomous-operation-registry";

export {
  planAutonomousOperation,
  buildTaskDraftFromProposedAction,
  buildApprovalDraftFromProposedAction,
  buildWorkflowDraftFromProposedAction,
  buildEscalationPayloadFromProposedAction,
} from "./autonomous-operation-planner";

export type { AutonomousOperationValidationResult } from "./autonomous-operation-audit";
export {
  validateAutonomousOperationInput,
  validateAutonomousOperationPlan,
  createAutonomousOperationAuditEvent,
  appendPlanAuditEvent,
} from "./autonomous-operation-audit";

export type {
  AutonomousOperationResult,
  AutonomousOperationExecution,
} from "./autonomous-operation-result";

// ── Fixtures (test / dev only) ────────────────────────────────────────────────

export {
  diegoFinanceApprovalInput,
  diegoFinanceTaskInput,
  lucaMarketingInput,
  milaCommercialInput,
  criticalBlockedInput,
  previewModeInput,
  diegoFinanceApprovalProposedAction,
  diegoFinanceTaskProposedAction,
  lucaMarketingApprovalProposedAction,
  milaCommercialTaskProposedAction,
  criticalBlockedProposedAction,
  previewModeProposedAction,
} from "./autonomous-operation-fixtures";
