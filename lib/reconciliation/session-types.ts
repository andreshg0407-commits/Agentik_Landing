/**
 * lib/reconciliation/session-types.ts
 *
 * AGENTIK-RECON-SESSIONS-01
 * Reconciliation Sessions Foundation — Domain Type Surface
 *
 * This file is the TypeScript type surface for the reconciliation session layer.
 * It does NOT import Prisma — pure types only.
 *
 * Covers:
 *   Task 1 — ReconciliationSession domain model
 *   Task 7 — Audit trail event types
 *  Task 11 — Future-ready contracts (ReconciliationException, ReconciliationMatchResult)
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { ReconciliationSourceType } from "./source-contract";

// ── Session lifecycle ──────────────────────────────────────────────────────────

/**
 * Lifecycle state of a reconciliation session.
 *
 *   draft              → Session created, not yet configured or run.
 *   ready              → Configured, ready to run (sources confirmed, period set).
 *   running            → A run is currently in progress.
 *   needs_review       → Run completed with differences; exceptions require review.
 *   partially_reconciled → Some records matched, some still open.
 *   reconciled         → All records matched within tolerance. Awaiting closure.
 *   closed             → Operator reviewed and formally closed the session.
 *   failed             → Run failed due to system/source error.
 *   cancelled          → Session cancelled before completion.
 */
export type ReconciliationSessionStatus =
  | "draft"
  | "ready"
  | "running"
  | "needs_review"
  | "partially_reconciled"
  | "reconciled"
  | "closed"
  | "failed"
  | "cancelled";

// ── Session domain type ────────────────────────────────────────────────────────

/**
 * A ReconciliationSession represents one auditable reconciliation operation.
 *
 * Example: RC-2026-00041 · Banco Bogotá vs Cobros SAG · Abril 2026
 *
 * The session is the durable unit: it can contain multiple runs (retries, reruns),
 * an event audit trail, and exception records.
 */
export interface ReconciliationSession {
  id:             string;
  organizationId: string;
  sessionCode:    string;                        // RC-YYYY-#####
  title:          string;
  sourceAType:    ReconciliationSourceType;
  sourceALabel:   string;
  sourceBType:    ReconciliationSourceType;
  sourceBLabel:   string;
  period:         string | null;                 // "YYYYMM" — null for date-range sessions
  status:         ReconciliationSessionStatus;
  createdBy:      string | null;                 // userId or "system"
  assignedTo:     string | null;                 // userId
  startedAt:      string | null;                 // ISO
  completedAt:    string | null;                 // ISO
  closedAt:       string | null;                 // ISO
  summaryJson:    ReconciliationSummarySnapshot | null;
  metadataJson:   Record<string, unknown> | null;
  createdAt:      string;                        // ISO
  updatedAt:      string;                        // ISO
}

/**
 * Lightweight summary snapshot stored on the session after a completed run.
 * Mirrors ReconSummary from lib/reconciliation/types.ts — no import to keep pure.
 */
export interface ReconciliationSummarySnapshot {
  total:              number;
  matched:            number;
  mismatchAmount:     number;
  onlyInA:            number;
  onlyInB:            number;
  possibleDuplicates: number;
  totalAmountA:       number;
  totalAmountB:       number;
  deltaTotal:         number;
  matchRate:          number;
}

// ── Session run ────────────────────────────────────────────────────────────────

/**
 * A single reconciliation run within a session.
 *
 * Sessions can have multiple runs (e.g., re-running after source correction).
 * Runs are numbered sequentially per session starting at 1.
 */
export interface ReconciliationSessionRun {
  id:             string;
  organizationId: string;
  sessionId:      string;
  runNumber:      number;
  status:         ReconciliationRunStatus;
  sourceAKey:     string | null;
  sourceBKey:     string | null;
  period:         string | null;
  summaryJson:    ReconciliationSummarySnapshot | null;
  errorJson:      Record<string, unknown> | null;
  startedAt:      string | null;
  completedAt:    string | null;
  createdAt:      string;
}

export type ReconciliationRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "unsupported";

// ── Audit trail ───────────────────────────────────────────────────────────────

/**
 * Reconciliation audit event types.
 *
 * Every meaningful action on a session emits an event.
 * Events are immutable and ordered — they form the audit trail.
 */
export type ReconAuditEventType =
  | "session_created"
  | "session_updated"
  | "session_closed"
  | "session_cancelled"
  | "run_started"
  | "run_completed"
  | "run_failed"
  | "exception_detected"
  | "manual_review_required"
  | "user_note_added"
  | "export_generated"
  | "status_changed"
  // AGENTIK-RECON-ENGINE-02 — engine mode events
  /** Shadow mode: universal engine finished its parallel run (fire-and-forget). */
  | "engine_shadow_completed"
  /** Shadow mode: legacy and universal summaries agree within tolerance. */
  | "engine_parity_passed"
  /** Shadow mode: legacy and universal summaries diverge — investigation needed. */
  | "engine_parity_failed"
  /** Universal mode: universal engine provided the response (normal path). */
  | "engine_universal_completed"
  /** Universal mode: universal engine failed; legacy was used as fallback. */
  | "engine_fallback_to_legacy"
  /** Aggregated exception summary persisted to run metadata. */
  | "exception_summary_created"
  // AGENTIK-RECON-EXCEPTIONS-02 — operator resolution events
  /** Operator moved an exception to under_review. */
  | "exception_under_review"
  /** Operator resolved an exception with an explanation. */
  | "exception_resolved"
  /** Operator ignored an exception (not actionable or out of scope). */
  | "exception_ignored"
  /** Operator reopened a previously resolved or ignored exception. */
  | "exception_reopened"
  /** Operator added an audit note to an exception. */
  | "exception_note_added";

export interface ReconciliationAuditEvent {
  id:             string;
  organizationId: string;
  sessionId:      string;
  actorType:      "system" | "user" | "agent";
  actorId:        string | null;
  eventType:      ReconAuditEventType;
  message:        string;
  metadataJson:   Record<string, unknown> | null;
  createdAt:      string;
}

// ── Future-ready contracts (Task 11) ──────────────────────────────────────────
// These types define the contracts for future sprints.
// They are NOT implemented yet — they exist to lock in the interface.

/**
 * A reconciliation exception is one unresolved difference from a run.
 *
 * Future sprints:
 *   - Exception resolution (manual/AI)
 *   - AI suggestions per exception
 *   - Manual approval workflow
 */
export interface ReconciliationException {
  id:           string;
  sessionId:    string;
  runId:        string;
  recordKey:    string;
  type:
    | "mismatch_amount"
    | "only_in_a"
    | "only_in_b"
    | "possible_duplicate"
    | "validation_error";
  severity:     "info" | "watch" | "elevated" | "critical";
  amountA:      number | null;
  amountB:      number | null;
  delta:        number | null;
  status:       "open" | "under_review" | "resolved" | "ignored";
  resolution:   string | null;
  resolvedBy:   string | null;
  resolvedAt:   string | null;
  metadataJson: Record<string, unknown> | null;
}

/**
 * Full match result from a session run.
 *
 * Extends ReconResult (from types.ts) with session context and exceptions.
 * Future: will replace current ReconResult once all adapters are migrated.
 */
export interface ReconciliationMatchResult {
  sessionId:    string;
  runId:        string;
  reconType:    string;
  scope:        string;
  sourceALabel: string;
  sourceBLabel: string;
  summary:      ReconciliationSummarySnapshot;
  exceptions:   ReconciliationException[];
  runAt:        string;
}

/**
 * Future document upload contract (for manual_upload and spreadsheet sources).
 * Copilot + AI suggestions will operate on normalized CanonicalReconRecord[].
 */
export interface ReconciliationDocumentUpload {
  sessionId:    string;
  sourceType:   "manual_upload" | "spreadsheet";
  fileName:     string;
  uploadedBy:   string;
  uploadedAt:   string;
  recordCount:  number;
  validated:    boolean;
  errorCount:   number;
}

/**
 * Copilot readiness slot — future AI agent integration contract.
 * Not implemented. Documents the interface for the AI layer.
 */
export const RECON_COPILOT_READINESS = {
  suggestExceptionResolution:
    "FUTURE — AI agent analyzes ReconciliationException[] and suggests resolution actions.",
  commentOnSession:
    "FUTURE — Copilot adds structured comments to ReconciliationAuditEvent with actorType='agent'.",
  detectPatterns:
    "FUTURE — AI compares ReconciliationSummarySnapshot across periods to detect anomalies.",
  bankMatchingGate:
    "FUTURE — bank_statement source requires bank feed API or statement upload before running.",
  dianXmlGate:
    "FUTURE — dian_xml source requires DIAN sync health (FISCAL_RECONCILIATION_READINESS.dianXmlBancoGate).",
} as const;

// ── Convenience: light session row for UI table ────────────────────────────────

/**
 * Slim projection of ReconciliationSession for UI table display.
 * Passed as props to client components — no heavy JSON blobs.
 */
export interface ReconSessionRow {
  id:          string;
  sessionCode: string;
  title:       string;
  period:      string | null;
  status:      ReconciliationSessionStatus;
  summary:     ReconciliationSummarySnapshot | null;
  updatedAt:   string;
}
