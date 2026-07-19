/**
 * lib/idempotency/idempotency-types.ts
 *
 * Agentik — Idempotency Core Types
 * Sprint: AGENTIK-IDEMPOTENCY-01
 *
 * Pure domain types for the idempotency layer.
 * No Prisma. No React. No Next.
 */

// ── Scope ─────────────────────────────────────────────────────────────────────

/**
 * Which operational domain this key belongs to.
 * Scopes are namespaced in the key: "task:...", "approval:...", etc.
 */
export type IdempotencyScope =
  | "AUTONOMOUS_OPERATION"
  | "TASK"
  | "APPROVAL"
  | "WORKFLOW_RUN"
  | "WORK_EXECUTION"
  | "AGENT_RUNTIME";

// ── Status ────────────────────────────────────────────────────────────────────

export type IdempotencyStatus =
  | "NEW"        // no prior record found — safe to create
  | "EXISTING"   // prior record found — return it
  | "DUPLICATE"  // same key submitted twice in same request (race or retry)
  | "CONFLICT"   // key exists but for a different entity type
  | "INVALID";   // key could not be built (missing required parts)

// ── Source ────────────────────────────────────────────────────────────────────

export type IdempotencySource =
  | "AGENT_RUNTIME"
  | "AUTONOMOUS_OPERATION"
  | "WORKFLOW_CHAIN"
  | "RETRY"
  | "INTEGRATION_TEST"
  | "MANUAL";

// ── Target ────────────────────────────────────────────────────────────────────

export interface IdempotencyTarget {
  scope:       IdempotencyScope;
  orgSlug:     string;
  entityType?: string;
  entityId?:   string;
}

// ── Input (for key building) ──────────────────────────────────────────────────

export interface IdempotencyInput {
  scope:               IdempotencyScope;
  orgSlug:             string;
  agentId?:            string;
  sourceRunId?:        string;
  proposedActionId?:   string;
  actionType?:         string;
  targetDomain?:       string;
  targetModule?:       string;
  entityType?:         string;
  entityId?:           string;
  workflowRunId?:      string;
  stepId?:             string;
  previousExecutionId?: string;
  metadata?:           Record<string, unknown>;
}

// ── Match (result of a lookup) ─────────────────────────────────────────────────

export interface IdempotencyMatch {
  key:           string;
  entityId:      string;
  entityType:    string;
  alreadyExists: boolean;
  foundAt?:      string;
}

// ── Audit event ───────────────────────────────────────────────────────────────

export type IdempotencyAuditEventType =
  | "idempotency_key_created"
  | "idempotency_hit"
  | "idempotency_miss"
  | "idempotency_conflict"
  | "idempotency_invalid";

export interface IdempotencyAuditEvent {
  id:         string;
  event:      IdempotencyAuditEventType;
  key:        string;
  scope:      IdempotencyScope;
  orgSlug:    string;
  message:    string;
  metadata?:  Record<string, unknown>;
  occurredAt: string;
}
