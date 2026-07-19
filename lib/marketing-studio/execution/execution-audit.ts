/**
 * lib/marketing-studio/execution/execution-audit.ts
 *
 * MS-13 — Execution Runtime: Structured audit logging
 *
 * Logs every significant execution event as structured JSON to console.
 * NO tokens, NO secrets, NO full payloads.
 * SERVER ONLY.
 */

export type ExecutionAuditEventType =
  | "job_created"
  | "job_started"
  | "handler_selected"
  | "external_call_started"
  | "external_call_completed"
  | "job_succeeded"
  | "job_failed"
  | "retry_scheduled"
  | "job_skipped"
  | "job_deduped"
  | "health_degraded"
  | "health_restored"
  | "batch_started"
  | "batch_completed"
  | "event_received"
  | "event_dispatched";

export interface ExecutionAuditEntry {
  ts:             string;
  event:          ExecutionAuditEventType;
  organizationId: string;
  jobId?:         string;
  jobType?:       string;
  destination?:   string;
  productId?:     string;
  retryCount?:    number;
  nextRetryAt?:   string;
  outcome?:       string;
  durationMs?:    number;
  detail?:        string;
}

const PREFIX = "[execution-runtime]";

export function auditExecution(entry: ExecutionAuditEntry): void {
  // Structured log — safe for log aggregation, no secrets
  const line = JSON.stringify({
    ...entry,
    ts: entry.ts ?? new Date().toISOString(),
  });
  if (entry.event === "job_failed" || entry.event === "health_degraded") {
    console.warn(PREFIX, line);
  } else {
    console.info(PREFIX, line);
  }
}
