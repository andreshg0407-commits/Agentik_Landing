/**
 * lib/agent-runtime/execution-lifecycle-types.ts
 *
 * Agentik Execution Lifecycle — Type Definitions
 *
 * Defines the full lifecycle record for controlled tool execution:
 * session → lease → validate → run → succeed/fail/timeout/cancel
 *
 * Sprint: AGENTIK-AGENT-EXECUTION-LIFECYCLE-01
 */

// ── Execution status ───────────────────────────────────────────────────────────

export type ExecutionStatus =
  | "queued"           // Session created, waiting to be picked up
  | "leasing"          // Acquiring a lease
  | "validating"       // Guard running
  | "running"          // Handler invoked
  | "succeeded"        // Completed successfully
  | "failed"           // Handler threw or returned error
  | "retry_scheduled"  // Failed but will be retried
  | "canceled"         // Explicitly canceled before or during execution
  | "timed_out"        // Execution exceeded timeoutMs
  | "skipped"          // Idempotency — already ran
  | "rejected";        // Guard denied — not retryable

// ── Lease status ──────────────────────────────────────────────────────────────

export type LeaseStatus =
  | "active"    // Lease is held by an owner
  | "released"  // Normally released after execution
  | "expired"   // TTL exceeded before release
  | "stolen";   // Overridden by another owner (rare, recovery case)

// ── Execution attempt ─────────────────────────────────────────────────────────

export interface ExecutionAttempt {
  id:              string;   // attempt_...
  sessionId:       string;
  attemptNumber:   number;
  status:          "running" | "succeeded" | "failed" | "timed_out";
  startedAt:       string;   // ISO
  completedAt:     string | null;
  durationMs:      number | null;
  error:           string | null;
  retryable:       boolean;
  nextRetryAt:     string | null;
  // Retry lineage
  parentAttemptId: string | null;   // attemptId this was retried from
  retryReason:     string | null;   // why this attempt was created
}

// ── Execution lease ───────────────────────────────────────────────────────────

export interface ExecutionLease {
  sessionId:   string;
  ownerId:     string;   // requestedBy / userId
  acquiredAt:  string;
  expiresAt:   string;
  releasedAt:  string | null;
  status:      LeaseStatus;
}

// ── Execution session ─────────────────────────────────────────────────────────

export interface ExecutionSession {
  // Identity
  id:             string;   // esess_...
  orgId:          string;
  actionId:       string;
  toolId:         string;
  agentId:        string;
  moduleKey:      string;

  // Lifecycle
  status:         ExecutionStatus;
  attempt:        number;           // Current attempt number (1-based)
  maxAttempts:    number;

  // Lease
  leaseOwner:     string | null;
  leaseExpiresAt: string | null;

  // Timing
  startedAt:      string | null;
  completedAt:    string | null;
  failedAt:       string | null;
  canceledAt:     string | null;
  timedOutAt:     string | null;
  durationMs:     number | null;

  // Idempotency
  idempotencyKey: string | null;

  // Correlation
  correlationId:  string | null;
  causationId:    string | null;

  // Input / Output
  payload:        Record<string, unknown>;
  result:         Record<string, unknown> | null;
  error:          string | null;
  errorCode:      string | null;

  // Audit
  events:         string[];   // event IDs
  attempts:       ExecutionAttempt[];
  lease:          ExecutionLease | null;

  // Meta
  createdAt:      string;
  updatedAt:      string;
}

// ── Session filter ────────────────────────────────────────────────────────────

export interface ExecutionSessionFilter {
  orgId?:     string;
  actionId?:  string;
  toolId?:    string;
  agentId?:   string;
  status?:    ExecutionStatus | ExecutionStatus[];
  since?:     string;
  limit?:     number;
}

// ── Session diagnostics ───────────────────────────────────────────────────────

export interface ExecutionDiagnostics {
  totalSessions:      number;
  running:            number;
  succeeded:          number;
  failed:             number;
  timedOut:           number;
  retryScheduled:     number;
  canceled:           number;
  rejected:           number;
  skipped:            number;
  queued:             number;
  stuck:              number;   // running with expired lease
  activeLeases:       number;
  expiredLeases:      number;
  idempotencyKeys:    number;
  totalAttempts:      number;   // sum of attempts across all sessions
  activeHeartbeats:   number;   // heartbeats currently running
  avgDurationMs:      number | null;
  storeType:          string;
}

// ── Transition error ──────────────────────────────────────────────────────────

export class ExecutionTransitionError extends Error {
  constructor(
    public readonly sessionId:   string,
    public readonly fromStatus:  ExecutionStatus,
    public readonly toStatus:    ExecutionStatus,
  ) {
    super(`Invalid execution transition: ${fromStatus} → ${toStatus} (session ${sessionId})`);
    this.name = "ExecutionTransitionError";
  }
}

// ── ID generators ─────────────────────────────────────────────────────────────

let _sessSeq = 0;
let _attSeq  = 0;
export function esessId():  string { return `esess_${Date.now()}_${++_sessSeq}`; }
export function eattId():   string { return `eatt_${Date.now()}_${++_attSeq}`; }
