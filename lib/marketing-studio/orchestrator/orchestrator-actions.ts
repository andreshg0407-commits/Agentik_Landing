/**
 * lib/marketing-studio/orchestrator/orchestrator-actions.ts
 *
 * MS-18 — Execution Actions: Action type system + DTOs + typed errors
 *
 * All types serializable. No Prisma. No side effects.
 */

// ── Action type catalog ───────────────────────────────────────────────────────

export const ORCHESTRATOR_ACTION_TYPE = {
  // Plan lifecycle
  CREATE_PLAN:           "create_plan",
  VALIDATE_PLAN:         "validate_plan",
  RUN_PLAN:              "run_plan",
  RETRY_PLAN:            "retry_plan",
  PAUSE_PLAN:            "pause_plan",
  RESUME_PLAN:           "resume_plan",
  CANCEL_PLAN:           "cancel_plan",
  ARCHIVE_PLAN:          "archive_plan",
  REBUILD_DEPENDENCIES:  "rebuild_dependencies",
  // Stage / job
  RUN_STAGE:             "run_stage",
  RUN_JOB:               "run_job",
  RETRY_STAGE:           "retry_stage",
  // Integration actions
  SYNC_SHOPIFY:          "sync_shopify",
  PUBLISH_SOCIAL:        "publish_social",
  PREPARE_WHATSAPP:      "prepare_whatsapp",
  REBUILD_CATALOG:       "rebuild_catalog",
  // Health
  REFRESH_HEALTH:        "refresh_health",
} as const;

export type OrchestratorActionType =
  typeof ORCHESTRATOR_ACTION_TYPE[keyof typeof ORCHESTRATOR_ACTION_TYPE];

// ── Request / result DTOs ─────────────────────────────────────────────────────

export interface OrchestratorActionRequest {
  organizationId:  string;
  actorId:         string | null;
  planId:          string | null;
  stageId:         string | null;
  jobId:           string | null;
  actionType:      OrchestratorActionType;
  payload:         Record<string, unknown>;
  idempotencyKey:  string;
  requestedAt:     string;
}

export interface OrchestratorActionResult {
  success:         boolean;
  actionType:      OrchestratorActionType;
  planId:          string | null;
  stageId:         string | null;
  jobId:           string | null;
  executionJobId:  string | null;
  wasDeduped:      boolean;
  message:         string;
  newPlanStatus:   string | null;
  newStageStatus:  string | null;
  error:           OrchestratorActionError | null;
}

export interface OrchestratorActionContext {
  organizationId:  string;
  actorId:         string | null;
  request:         OrchestratorActionRequest;
}

export interface OrchestratorActionAudit {
  id:             string;
  organizationId: string;
  actorId:        string | null;
  actionType:     OrchestratorActionType;
  planId:         string | null;
  stageId:        string | null;
  jobId:          string | null;
  idempotencyKey: string;
  success:        boolean;
  errorCode:      string | null;
  executionJobId: string | null;
  requestedAt:    string;
  completedAt:    string;
}

export interface OrchestratorActionError {
  code:    string;
  message: string;
}

// ── Typed errors ──────────────────────────────────────────────────────────────

export class ActionNotAllowedError extends Error {
  readonly code = "ACTION_NOT_ALLOWED";
  constructor(message: string) { super(message); this.name = "ActionNotAllowedError"; }
}

export class InvalidTransitionError extends Error {
  readonly code = "INVALID_TRANSITION";
  constructor(from: string, to: string) {
    super(`Cannot transition from "${from}" to "${to}"`);
    this.name = "InvalidTransitionError";
  }
}

export class DependencyBlockedError extends Error {
  readonly code = "DEPENDENCY_BLOCKED";
  constructor(message: string) { super(message); this.name = "DependencyBlockedError"; }
}

export class HandlerNotImplementedError extends Error {
  readonly code = "HANDLER_NOT_IMPLEMENTED";
  constructor(actionType: string) {
    super(`Handler for "${actionType}" is not yet implemented`);
    this.name = "HandlerNotImplementedError";
  }
}

export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";
  constructor(key: string) {
    super(`Action with key "${key}" is already active`);
    this.name = "IdempotencyConflictError";
  }
}

export class PlanNotFoundError extends Error {
  readonly code = "PLAN_NOT_FOUND";
  constructor(planId: string) { super(`Plan "${planId}" not found`); this.name = "PlanNotFoundError"; }
}

export class StageNotFoundError extends Error {
  readonly code = "STAGE_NOT_FOUND";
  constructor(stageId: string) { super(`Stage "${stageId}" not found`); this.name = "StageNotFoundError"; }
}

export class JobNotFoundError extends Error {
  readonly code = "JOB_NOT_FOUND";
  constructor(jobId: string) { super(`Job "${jobId}" not found`); this.name = "JobNotFoundError"; }
}

// ── Error → safe DTO ──────────────────────────────────────────────────────────

export function toActionError(err: unknown): OrchestratorActionError {
  if (err instanceof ActionNotAllowedError)   return { code: err.code, message: err.message };
  if (err instanceof InvalidTransitionError)   return { code: err.code, message: err.message };
  if (err instanceof DependencyBlockedError)   return { code: err.code, message: err.message };
  if (err instanceof HandlerNotImplementedError) return { code: err.code, message: err.message };
  if (err instanceof IdempotencyConflictError)  return { code: err.code, message: err.message };
  if (err instanceof PlanNotFoundError)        return { code: err.code, message: err.message };
  if (err instanceof StageNotFoundError)       return { code: err.code, message: err.message };
  if (err instanceof JobNotFoundError)         return { code: err.code, message: err.message };
  // Fallback — never expose internals
  return { code: "INTERNAL_ERROR", message: "An unexpected error occurred" };
}

// ── Idempotency key builders ──────────────────────────────────────────────────

export function buildActionIdempotencyKey(
  actionType:     OrchestratorActionType,
  organizationId: string,
  entityId:       string,
  suffix?:        string,
): string {
  const parts = [actionType, organizationId, entityId];
  if (suffix) parts.push(suffix);
  return parts.join(":");
}
