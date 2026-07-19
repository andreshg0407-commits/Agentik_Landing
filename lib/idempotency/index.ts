/**
 * lib/idempotency/index.ts
 *
 * Agentik — Idempotency Public Barrel
 * Sprint: AGENTIK-IDEMPOTENCY-01
 *
 * Client-safe barrel. No server-only imports.
 * Pure domain types and key-building utilities.
 */

// Types
export type {
  IdempotencyScope,
  IdempotencyStatus,
  IdempotencySource,
  IdempotencyTarget,
  IdempotencyInput,
  IdempotencyMatch,
  IdempotencyAuditEventType,
  IdempotencyAuditEvent,
} from "./idempotency-types";

// Key building
export {
  normalizeIdempotencyPart,
  safeJoinIdempotencyParts,
  buildIdempotencyKey,
  buildAutonomousOperationIdempotencyKey,
  buildTaskIdempotencyKey,
  buildApprovalIdempotencyKey,
  buildWorkflowRunIdempotencyKey,
  buildWorkExecutionIdempotencyKey,
} from "./idempotency-key";

// Audit & validation
export {
  validateIdempotencyInput,
  validateIdempotencyKey,
  auditIdempotencyDecision,
} from "./idempotency-audit";

// Result
export type { IdempotencyCheckResult } from "./idempotency-result";
export {
  idempotencyHit,
  idempotencyMiss,
  idempotencyInvalid,
} from "./idempotency-result";
