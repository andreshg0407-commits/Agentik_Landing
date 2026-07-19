/**
 * lib/agent-runtime/execution-idempotency.ts
 *
 * Agentik Execution Lifecycle — Idempotency Control
 *
 * Session-level idempotency layer on top of tool-handler-registry.ts key tracking.
 * Prevents duplicate execution sessions for the same logical operation.
 *
 * Sprint: AGENTIK-AGENT-EXECUTION-LIFECYCLE-01
 */

import { findSessionByIdempotencyKey } from "./execution-session-store";
import type { ExecutionSession } from "./execution-lifecycle-types";

// ── Key builders ──────────────────────────────────────────────────────────────

/**
 * Builds a stable idempotency key for an execution session.
 * Format: "exec:{orgId}:{actionId}:{toolId}"
 */
export function buildExecutionIdempotencyKey(
  orgId:    string,
  actionId: string,
  toolId:   string,
): string {
  return `exec:${orgId}:${actionId}:${toolId}`;
}

/**
 * Builds a user-scoped idempotency key for a specific request.
 * Format: "exec:{orgId}:{actionId}:{toolId}:{requestedBy}"
 */
export function buildUserScopedIdempotencyKey(
  orgId:       string,
  actionId:    string,
  toolId:      string,
  requestedBy: string,
): string {
  return `exec:${orgId}:${actionId}:${toolId}:${requestedBy}`;
}

// ── Idempotency check ─────────────────────────────────────────────────────────

export interface IdempotencyCheckResult {
  isDuplicate:     boolean;
  existingSession: ExecutionSession | null;
  reason:          string | null;
}

/**
 * Check whether an execution with this idempotency key has already run (or is running).
 * Looks up the session store for an existing session with the same key.
 */
export async function preventDuplicateExecution(
  idempotencyKey: string,
  orgId:          string,
): Promise<IdempotencyCheckResult> {
  const existing = await findSessionByIdempotencyKey(idempotencyKey, orgId);

  if (!existing) {
    return { isDuplicate: false, existingSession: null, reason: null };
  }

  // Succeeded — skip silently
  if (existing.status === "succeeded") {
    return {
      isDuplicate:     true,
      existingSession: existing,
      reason:          `Already succeeded (session ${existing.id})`,
    };
  }

  // Still in flight — do not double-execute
  if (["queued", "leasing", "validating", "running"].includes(existing.status)) {
    return {
      isDuplicate:     true,
      existingSession: existing,
      reason:          `In progress with status "${existing.status}" (session ${existing.id})`,
    };
  }

  // Terminal failure — allow re-execution (caller decides based on retry policy)
  return { isDuplicate: false, existingSession: existing, reason: null };
}

/**
 * Convenience: check idempotency and return the existing session result if
 * duplicate, or null if the execution should proceed.
 */
export async function checkSessionIdempotency(
  orgId:    string,
  actionId: string,
  toolId:   string,
): Promise<ExecutionSession | null> {
  const key    = buildExecutionIdempotencyKey(orgId, actionId, toolId);
  const check  = await preventDuplicateExecution(key, orgId);
  return check.isDuplicate ? check.existingSession : null;
}
