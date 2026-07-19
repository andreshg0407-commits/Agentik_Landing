/**
 * lib/agent-runtime/execution-lifecycle.ts
 *
 * Agentik Execution Lifecycle — State Machine
 *
 * Validates and applies execution status transitions.
 * No transition is allowed unless it appears in the allowed-transitions table.
 *
 * Sprint: AGENTIK-AGENT-EXECUTION-LIFECYCLE-01
 */

import type { ExecutionStatus, ExecutionSession, ExecutionAttempt } from "./execution-lifecycle-types";
import { ExecutionTransitionError, eattId } from "./execution-lifecycle-types";
import { updateExecutionSession } from "./execution-session-store";

// ── Transition table ──────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  queued:           ["leasing", "canceled", "skipped"],
  leasing:          ["validating", "canceled", "failed"],
  validating:       ["running", "rejected", "failed", "canceled"],
  running:          ["succeeded", "failed", "timed_out", "canceled"],
  succeeded:        [],
  failed:           ["retry_scheduled", "canceled"],
  retry_scheduled:  ["queued", "canceled"],
  canceled:         [],
  timed_out:        ["retry_scheduled", "canceled"],
  skipped:          [],
  rejected:         [],
};

function assertTransition(
  sessionId: string,
  from: ExecutionStatus,
  to: ExecutionStatus,
): void {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ExecutionTransitionError(sessionId, from, to);
  }
}

// ── Transition helpers ────────────────────────────────────────────────────────

export async function markExecutionQueued(
  session: ExecutionSession,
): Promise<ExecutionSession> {
  assertTransition(session.id, session.status, "queued");
  return updateExecutionSession(session.id, {
    status:  "queued",
    attempt: 0,
  });
}

export async function markExecutionLeasing(
  session: ExecutionSession,
): Promise<ExecutionSession> {
  assertTransition(session.id, session.status, "leasing");
  return updateExecutionSession(session.id, { status: "leasing" });
}

export async function markExecutionValidating(
  session: ExecutionSession,
): Promise<ExecutionSession> {
  assertTransition(session.id, session.status, "validating");
  return updateExecutionSession(session.id, { status: "validating" });
}

export async function markExecutionRunning(
  session: ExecutionSession,
): Promise<ExecutionSession> {
  assertTransition(session.id, session.status, "running");
  const now     = new Date().toISOString();
  const attempt = session.attempt + 1;
  // Capture parent attempt for retry lineage
  const parentAttempt = session.attempts.length > 0
    ? session.attempts[session.attempts.length - 1]
    : null;
  const isRetry = session.attempt > 0;

  const attRec: ExecutionAttempt = {
    id:              eattId(),
    sessionId:       session.id,
    attemptNumber:   attempt,
    status:          "running",
    startedAt:       now,
    completedAt:     null,
    durationMs:      null,
    error:           null,
    retryable:       false,
    nextRetryAt:     null,
    parentAttemptId: isRetry && parentAttempt ? parentAttempt.id : null,
    retryReason:     isRetry ? (parentAttempt?.retryReason ?? "retry") : null,
  };
  return updateExecutionSession(session.id, {
    status:    "running",
    attempt,
    startedAt: session.startedAt ?? now,
    attempts:  [...session.attempts, attRec],
  });
}

export async function markExecutionSucceeded(
  session: ExecutionSession,
  result:  Record<string, unknown>,
): Promise<ExecutionSession> {
  assertTransition(session.id, session.status, "succeeded");
  const now        = new Date().toISOString();
  const durationMs = session.startedAt
    ? Date.now() - new Date(session.startedAt).getTime()
    : null;

  const attempts = session.attempts.map(a =>
    a.attemptNumber === session.attempt
      ? { ...a, status: "succeeded" as const, completedAt: now, durationMs }
      : a,
  );

  return updateExecutionSession(session.id, {
    status:      "succeeded",
    result,
    completedAt: now,
    durationMs,
    attempts,
  });
}

export async function markExecutionFailed(
  session:   ExecutionSession,
  error:     string,
  errorCode: string | null = null,
  retryable: boolean       = false,
): Promise<ExecutionSession> {
  assertTransition(session.id, session.status, "failed");
  const now        = new Date().toISOString();
  const durationMs = session.startedAt
    ? Date.now() - new Date(session.startedAt).getTime()
    : null;

  const attempts = session.attempts.map(a =>
    a.attemptNumber === session.attempt
      ? { ...a, status: "failed" as const, completedAt: now, durationMs, error, retryable }
      : a,
  );

  return updateExecutionSession(session.id, {
    status:    "failed",
    error,
    errorCode,
    failedAt:  now,
    durationMs,
    attempts,
  });
}

export async function markExecutionRetryScheduled(
  session:     ExecutionSession,
  nextRetryAt: string,
): Promise<ExecutionSession> {
  assertTransition(session.id, session.status, "retry_scheduled");
  const attempts = session.attempts.map(a =>
    a.attemptNumber === session.attempt
      ? { ...a, retryable: true, nextRetryAt }
      : a,
  );
  return updateExecutionSession(session.id, {
    status:  "retry_scheduled",
    attempts,
  });
}

export async function markExecutionCanceled(
  session: ExecutionSession,
): Promise<ExecutionSession> {
  assertTransition(session.id, session.status, "canceled");
  return updateExecutionSession(session.id, {
    status:     "canceled",
    canceledAt: new Date().toISOString(),
  });
}

export async function markExecutionTimedOut(
  session: ExecutionSession,
): Promise<ExecutionSession> {
  assertTransition(session.id, session.status, "timed_out");
  const now        = new Date().toISOString();
  const durationMs = session.startedAt
    ? Date.now() - new Date(session.startedAt).getTime()
    : null;

  const attempts = session.attempts.map(a =>
    a.attemptNumber === session.attempt
      ? { ...a, status: "timed_out" as const, completedAt: now, durationMs, retryable: true }
      : a,
  );

  return updateExecutionSession(session.id, {
    status:     "timed_out",
    timedOutAt: now,
    durationMs,
    attempts,
  });
}

export async function markExecutionSkipped(
  session: ExecutionSession,
  reason:  string = "idempotency",
): Promise<ExecutionSession> {
  assertTransition(session.id, session.status, "skipped");
  return updateExecutionSession(session.id, {
    status:      "skipped",
    error:       reason,
    completedAt: new Date().toISOString(),
  });
}

export async function markExecutionRejected(
  session: ExecutionSession,
  reason:  string,
): Promise<ExecutionSession> {
  assertTransition(session.id, session.status, "rejected");
  return updateExecutionSession(session.id, {
    status:    "rejected",
    error:     reason,
    failedAt:  new Date().toISOString(),
  });
}

// ── Attempt-level helpers ─────────────────────────────────────────────────────
//
// These operate on the latest attempt in session.attempts[].
// They do NOT create new attempt records — markExecutionRunning does that.
// Call these AFTER markExecutionRunning to update the attempt terminal state.

export async function markAttemptSucceeded(
  session:    ExecutionSession,
  durationMs: number,
): Promise<ExecutionSession> {
  const now      = new Date().toISOString();
  const attempts = session.attempts.map(a =>
    a.attemptNumber === session.attempt
      ? { ...a, status: "succeeded" as const, completedAt: now, durationMs }
      : a,
  );
  return updateExecutionSession(session.id, { attempts });
}

export async function markAttemptFailed(
  session:    ExecutionSession,
  error:      string,
  durationMs: number,
  retryable:  boolean,
): Promise<ExecutionSession> {
  const now      = new Date().toISOString();
  const attempts = session.attempts.map(a =>
    a.attemptNumber === session.attempt
      ? { ...a, status: "failed" as const, completedAt: now, durationMs, error, retryable }
      : a,
  );
  return updateExecutionSession(session.id, { attempts });
}

export async function markAttemptTimedOut(
  session:    ExecutionSession,
  durationMs: number,
): Promise<ExecutionSession> {
  const now      = new Date().toISOString();
  const attempts = session.attempts.map(a =>
    a.attemptNumber === session.attempt
      ? { ...a, status: "timed_out" as const, completedAt: now, durationMs, retryable: true }
      : a,
  );
  return updateExecutionSession(session.id, { attempts });
}

/** Returns the latest attempt for a session, or null if no attempts yet. */
export function getLatestAttempt(session: ExecutionSession) {
  if (session.attempts.length === 0) return null;
  return session.attempts.find(a => a.attemptNumber === session.attempt) ?? null;
}

// ── Guard helper ──────────────────────────────────────────────────────────────

export function isTerminalStatus(status: ExecutionStatus): boolean {
  return ["succeeded", "failed", "canceled", "timed_out", "skipped", "rejected"].includes(status);
}

export function isRetryableStatus(status: ExecutionStatus): boolean {
  return status === "failed" || status === "timed_out";
}
