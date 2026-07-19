/**
 * lib/business-flow/index.ts
 *
 * PRODUCTION-WORKFLOW-01
 * Barrel export for the Business Flow Engine.
 *
 * Client-safe: no Prisma, no server-only, no React.
 * Import from "@/lib/business-flow" for all workflow contracts.
 */

// ── Core Types ───────────────────────────────────────────────────────────────
export type {
  WorkflowDomain,
  WorkflowStatus,
  WorkflowPriority,
  WorkflowEntityBinding,
  WorkflowMetadata,
} from "./workflow-types";

// ── Stage ────────────────────────────────────────────────────────────────────
export type { WorkflowStageDefinition } from "./workflow-stage";
export { buildStage } from "./workflow-stage";

// ── Transition ───────────────────────────────────────────────────────────────
export type {
  TransitionConditionOperator,
  TransitionCondition,
  TransitionRule,
  TransitionMode,
  WorkflowTransition,
} from "./workflow-transition";
export {
  buildTransition,
  transitionsFrom,
  transitionsTo,
  isBranchPoint,
  isMergePoint,
} from "./workflow-transition";

// ── Definition ───────────────────────────────────────────────────────────────
export type {
  WorkflowDefinition,
  WorkflowValidationResult,
  WorkflowValidationError,
} from "./workflow-definition";
export {
  validateWorkflowDefinition,
  getStage,
  stageCodesInOrder,
  isTerminalStage,
} from "./workflow-definition";

// ── State ────────────────────────────────────────────────────────────────────
export type {
  StageStatus,
  StageProgress,
  WorkflowProgress,
} from "./workflow-state";
export {
  emptyStageProgress,
  computeWorkflowProgress,
} from "./workflow-state";

// ── History ──────────────────────────────────────────────────────────────────
export type {
  WorkflowHistoryEventType,
  WorkflowHistoryEntry,
} from "./workflow-history";
export {
  nextHistoryId,
  buildHistoryEntry,
} from "./workflow-history";

// ── Instance ─────────────────────────────────────────────────────────────────
export type { WorkflowInstance } from "./workflow-instance";
export {
  nextInstanceId,
  createInstance,
} from "./workflow-instance";

// ── Metrics ──────────────────────────────────────────────────────────────────
export type {
  WorkflowInstanceMetrics,
  StageTiming,
  WorkflowAggregateMetrics,
} from "./workflow-metrics";
export { computeInstanceMetrics } from "./workflow-metrics";

// ── Template ─────────────────────────────────────────────────────────────────
export type {
  WorkflowTemplate,
  BuiltinTemplateCode,
} from "./workflow-template";

// ── Engine ───────────────────────────────────────────────────────────────────
export type {
  WorkflowAdvanceResult,
  WorkflowEventType,
  IWorkflowEngine,
} from "./workflow-engine";

// ── Utils ────────────────────────────────────────────────────────────────────
export {
  isTerminal,
  isAdvanceable,
  isPauseable,
  isResumable,
  getNextStageCodes,
  getDefaultNextStage,
  estimateCompletion,
  isSlaBreached,
  slaRemainingHours,
} from "./workflow-utils";
