/**
 * lib/agent-runtime/execution-retry-policy.ts
 *
 * Agentik Execution Lifecycle — Retry Policy
 *
 * V1: Calculate only. No automatic retry scheduling.
 * Callers decide whether to act on the policy output.
 *
 * Sprint: AGENTIK-AGENT-EXECUTION-LIFECYCLE-01
 */

import type { ExecutionSession } from "./execution-lifecycle-types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RetryPolicy {
  maxAttempts:   number;
  baseDelayMs:   number;
  maxDelayMs:    number;
  backoffFactor: number;
  retryOnCodes:  string[];
}

export interface RetryDecision {
  shouldRetry:  boolean;
  reason:       string;
  nextRetryAt:  string | null;
  attemptNumber: number;
  delayMs:      number | null;
}

export type ErrorClass =
  | "transient"    // Network glitch, timeout, rate-limit — retry likely
  | "permanent"    // Bad input, guard rejection — do not retry
  | "unknown";     // Unexpected — retry with caution

// ── Default policy ────────────────────────────────────────────────────────────

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts:   3,
  baseDelayMs:   2_000,
  maxDelayMs:    30_000,
  backoffFactor: 2,
  retryOnCodes:  ["TIMEOUT", "NETWORK_ERROR", "RATE_LIMITED", "TOOL_UNAVAILABLE"],
};

// ── Error classification ──────────────────────────────────────────────────────

const TRANSIENT_CODES = new Set([
  "TIMEOUT", "NETWORK_ERROR", "RATE_LIMITED", "TOOL_UNAVAILABLE",
  "EXTERNAL_SERVICE_ERROR", "TEMPORARY_FAILURE",
]);

const PERMANENT_CODES = new Set([
  "GUARD_REJECTED", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND",
  "INVALID_PAYLOAD", "SCHEMA_ERROR", "IDEMPOTENCY_CONFLICT",
]);

export function classifyExecutionError(
  error:     string,
  errorCode: string | null,
): ErrorClass {
  if (errorCode && PERMANENT_CODES.has(errorCode)) return "permanent";
  if (errorCode && TRANSIENT_CODES.has(errorCode)) return "transient";

  const lower = error.toLowerCase();
  if (lower.includes("timeout") || lower.includes("rate limit") || lower.includes("network")) {
    return "transient";
  }
  if (lower.includes("unauthorized") || lower.includes("forbidden") || lower.includes("rejected")) {
    return "permanent";
  }
  return "unknown";
}

// ── Backoff calculation ───────────────────────────────────────────────────────

export function calculateBackoffDelayMs(
  attempt: number,
  policy:  RetryPolicy = DEFAULT_RETRY_POLICY,
): number {
  const exponential = policy.baseDelayMs * Math.pow(policy.backoffFactor, attempt - 1);
  const jitter      = Math.random() * 0.2 * exponential; // ±10% jitter
  return Math.min(Math.round(exponential + jitter), policy.maxDelayMs);
}

export function calculateNextRetryAt(
  attempt: number,
  policy:  RetryPolicy = DEFAULT_RETRY_POLICY,
): string {
  const delayMs = calculateBackoffDelayMs(attempt, policy);
  return new Date(Date.now() + delayMs).toISOString();
}

// ── Retry decision ────────────────────────────────────────────────────────────

export function shouldRetryExecution(
  session: ExecutionSession,
  policy:  RetryPolicy = DEFAULT_RETRY_POLICY,
): RetryDecision {
  const nextAttempt = session.attempt + 1;

  // Exhausted attempts
  if (session.attempt >= policy.maxAttempts) {
    return {
      shouldRetry:   false,
      reason:        `Max attempts reached (${session.attempt}/${policy.maxAttempts})`,
      nextRetryAt:   null,
      attemptNumber: nextAttempt,
      delayMs:       null,
    };
  }

  // Permanent error — do not retry
  const errorClass = classifyExecutionError(
    session.error ?? "",
    session.errorCode,
  );
  if (errorClass === "permanent") {
    return {
      shouldRetry:   false,
      reason:        `Permanent error (${session.errorCode ?? "unknown code"}) — not retryable`,
      nextRetryAt:   null,
      attemptNumber: nextAttempt,
      delayMs:       null,
    };
  }

  // Check if latest attempt is retryable
  const latestAttempt = session.attempts[session.attempts.length - 1];
  if (latestAttempt && !latestAttempt.retryable) {
    return {
      shouldRetry:   false,
      reason:        "Latest attempt was marked non-retryable",
      nextRetryAt:   null,
      attemptNumber: nextAttempt,
      delayMs:       null,
    };
  }

  const delayMs     = calculateBackoffDelayMs(session.attempt, policy);
  const nextRetryAt = new Date(Date.now() + delayMs).toISOString();

  return {
    shouldRetry:   true,
    reason:        `Retryable ${errorClass} error — attempt ${nextAttempt}/${policy.maxAttempts}`,
    nextRetryAt,
    attemptNumber: nextAttempt,
    delayMs,
  };
}
