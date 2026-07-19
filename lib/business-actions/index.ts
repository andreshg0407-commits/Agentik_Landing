/**
 * index.ts
 *
 * BUSINESS-ACTION-ENGINE-01
 * Client-safe barrel export for the Business Action Engine.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

// Types
export type {
  ActionStatus,
  ActionType,
  ActionSource,
  ExecutionMode,
  ExecutionStatus,
  ActionApprovalStatus,
  ActionApprovalType,
  ActionTargetKind,
  ActionEntityRef,
  ActionRiskLevel,
} from "./action-types";
export { nextActionId } from "./action-types";

// Action
export type { BusinessAction } from "./action";
export { buildBusinessAction } from "./action";

// Action Plan
export type { ActionPlan } from "./action-plan";
export { buildActionPlan } from "./action-plan";

// Step
export type { ActionStep, ActionTarget } from "./action-step";
export { buildActionStep } from "./action-step";

// Approval
export type { ActionApproval } from "./action-approval";
export {
  buildActionApproval,
  noActionApprovalNeeded,
  approveAction,
  rejectAction,
} from "./action-approval";

// Policy
export type { ActionPolicy, PolicyCheckResult } from "./action-policy";
export { buildActionPolicy, defaultSafePolicy, checkPolicy } from "./action-policy";

// Execution
export type { ActionExecution } from "./action-execution";
export { buildActionExecution, completeExecution } from "./action-execution";

// Result
export type {
  ActionExecutionResult,
  SuggestedEvent,
  SuggestedNextAction,
} from "./action-result";
export {
  buildSuccessResult,
  buildDryRunResult,
  buildFailedResult,
  buildApprovalRequiredResult,
} from "./action-result";

// Trace
export type { ActionTrace } from "./action-trace";
export { buildActionTrace } from "./action-trace";

// Receipt
export type { ActionReceipt } from "./action-receipt";
export { buildActionReceipt, buildDryRunReceipt } from "./action-receipt";

// Context
export type { ActionContext, ActionEntitySnapshot } from "./action-context";
export { buildActionContext } from "./action-context";

// Engine
export type { IActionEngine } from "./action-engine";
export { InMemoryActionEngine } from "./action-engine";

// Registry
export type { ActionHandler } from "./action-registry";
export { ActionRegistry, DEFAULT_HANDLERS } from "./action-registry";

// Utils
export {
  actionsByStatus,
  actionsByType,
  actionsPendingApproval,
  countActionsByStatus,
  countActionsByType,
  planActions,
  isPlanComplete,
  hasPlanFailure,
  hasPendingApprovals,
  allSuggestedEvents,
  successCount,
  failureCount,
  dryRunCount,
  actionPlanSummary,
  actionSummary,
} from "./action-utils";
