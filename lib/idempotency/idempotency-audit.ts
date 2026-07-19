/**
 * lib/idempotency/idempotency-audit.ts
 *
 * Agentik — Idempotency Audit & Validation Helpers
 * Sprint: AGENTIK-IDEMPOTENCY-01
 *
 * Pure domain. No Prisma. No React. Never throws.
 */

import type {
  IdempotencyAuditEvent,
  IdempotencyAuditEventType,
  IdempotencyInput,
  IdempotencyScope,
} from "./idempotency-types";

// ── ID generation ─────────────────────────────────────────────────────────────

let _seq = 0;
function nextAuditId(): string {
  _seq++;
  return `idem_evt_${Date.now()}_${_seq.toString(36)}`;
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface IdempotencyValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
}

/**
 * Validate that an IdempotencyInput has the minimum required fields.
 * Never throws — returns structured result.
 */
export function validateIdempotencyInput(
  input: IdempotencyInput,
): IdempotencyValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!input.scope)   errors.push("idempotency: scope is required");
  if (!input.orgSlug) errors.push("idempotency: orgSlug is required");

  if (!input.sourceRunId && !input.proposedActionId) {
    warnings.push("idempotency: neither sourceRunId nor proposedActionId provided — key will not be unique across runs");
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate that a built key is non-empty and reasonably formed.
 */
export function validateIdempotencyKey(key: string): IdempotencyValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!key || key.trim() === "") {
    errors.push("idempotency: key is empty");
    return { valid: false, errors, warnings };
  }

  const parts = key.split(":");
  if (parts.length < 2) {
    errors.push(`idempotency: key has too few parts (got ${parts.length}, min 2): "${key}"`);
  }

  if (key.length > 512) {
    warnings.push(`idempotency: key is unusually long (${key.length} chars) — may indicate unbounded input`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Audit event factory ───────────────────────────────────────────────────────

/**
 * Create an idempotency audit event. Never throws.
 */
export function auditIdempotencyDecision(
  event:    IdempotencyAuditEventType,
  key:      string,
  scope:    IdempotencyScope,
  orgSlug:  string,
  message:  string,
  metadata?: Record<string, unknown>,
): IdempotencyAuditEvent {
  return {
    id:         nextAuditId(),
    event,
    key,
    scope,
    orgSlug,
    message,
    metadata,
    occurredAt: new Date().toISOString(),
  };
}
