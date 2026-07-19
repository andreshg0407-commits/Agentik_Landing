/**
 * lib/copilot/intelligence/reasoning/integrations/reasoning-audit.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Integration — Audit Layer
 *
 * Records reasoning activity for audit trail purposes.
 * Each reasoning run produces a structured audit event that can be
 * sent to the audit log (if available) or stored in-memory.
 *
 * Audit records include:
 *   - query (what was asked)
 *   - evidence (what was found, not the values)
 *   - hypotheses (what was hypothesized)
 *   - conclusion (what was concluded, not the content)
 *
 * NEVER stores:
 *   - Raw signal values
 *   - Secret or sensitive data
 *   - PII
 *
 * No Prisma. No server-only. Pure adapter. Never throws.
 */

import type { ReasoningConclusion } from "../reasoning-types";

// ── Audit event types ──────────────────────────────────────────────────────────

export type ReasoningAuditEventType =
  | "REASONING_STARTED"
  | "REASONING_COMPLETED"
  | "REASONING_FAILED"
  | "INSIGHT_GENERATED"
  | "HYPOTHESIS_GENERATED"
  | "CONTRADICTION_DETECTED"
  | "PIPELINE_TIMEOUT";

export interface ReasoningAuditEvent {
  eventId:    string;
  eventType:  ReasoningAuditEventType;
  orgSlug:    string;
  queryId:    string;
  timestamp:  string;
  durationMs?: number;
  metadata:   Record<string, unknown>;
}

export interface ReasoningAuditLog {
  orgSlug:   string;
  queryId:   string;
  events:    ReasoningAuditEvent[];
  startedAt: string;
  completedAt?: string;
}

// ── Audit log builder ──────────────────────────────────────────────────────────

let _counter = 0;
function _eventId(): string {
  return `raud_${Date.now()}_${(++_counter % 1_000_000).toString().padStart(6, "0")}`;
}

/**
 * createReasoningAuditLog — initialize an audit log for a reasoning run.
 */
export function createReasoningAuditLog(
  orgSlug:  string,
  queryId:  string,
): ReasoningAuditLog {
  return {
    orgSlug,
    queryId,
    events:    [],
    startedAt: new Date().toISOString(),
  };
}

/**
 * auditReasoningStarted — record that a reasoning run has begun.
 */
export function auditReasoningStarted(
  log:      ReasoningAuditLog,
  query:    string,
  domains:  string[],
): ReasoningAuditLog {
  return _appendEvent(log, {
    eventType: "REASONING_STARTED",
    metadata:  {
      queryLength: query.length,
      domains,
    },
  });
}

/**
 * auditReasoningCompleted — record a successful reasoning run conclusion.
 * Never stores insight content — only metadata.
 */
export function auditReasoningCompleted(
  log:        ReasoningAuditLog,
  conclusion: ReasoningConclusion,
): ReasoningAuditLog {
  const updated = _appendEvent(log, {
    eventType: "REASONING_COMPLETED",
    durationMs: conclusion.durationMs,
    metadata:  {
      insightCount:       conclusion.insights.length,
      hypothesisCount:    conclusion.hypotheses.length,
      evidenceCount:      conclusion.evidence.length,
      contradictionCount: conclusion.contradictions.length,
      overallConfidence:  conclusion.overallConfidence,
      overallScore:       conclusion.overallConfidenceScore,
      executiveImpact:    conclusion.executiveImpact,
      domains:            conclusion.domains,
    },
  });

  return { ...updated, completedAt: new Date().toISOString() };
}

/**
 * auditReasoningFailed — record a pipeline failure.
 */
export function auditReasoningFailed(
  log:     ReasoningAuditLog,
  phase:   string,
  reason:  string,
): ReasoningAuditLog {
  return _appendEvent(log, {
    eventType: "REASONING_FAILED",
    metadata:  { phase, reason },
  });
}

/**
 * auditInsightGenerated — record each insight generation (metadata only).
 */
export function auditInsightGenerated(
  log:    ReasoningAuditLog,
  insightId: string,
  type:      string,
  impact:    string,
  confidence: string,
): ReasoningAuditLog {
  return _appendEvent(log, {
    eventType: "INSIGHT_GENERATED",
    metadata:  { insightId, type, impact, confidence },
  });
}

/**
 * auditHypothesisGenerated — record hypothesis generation (metadata only).
 */
export function auditHypothesisGenerated(
  log:         ReasoningAuditLog,
  hypothesisId: string,
  patternKey:   string,
  status:       string,
  confidence:   string,
): ReasoningAuditLog {
  return _appendEvent(log, {
    eventType: "HYPOTHESIS_GENERATED",
    metadata:  { hypothesisId, patternKey, status, confidence },
  });
}

/**
 * auditContradictionDetected — record when a contradiction was found.
 */
export function auditContradictionDetected(
  log:          ReasoningAuditLog,
  contradictionId: string,
  severity:     string,
  resolution:   string,
): ReasoningAuditLog {
  return _appendEvent(log, {
    eventType: "CONTRADICTION_DETECTED",
    metadata:  { contradictionId, severity, resolution },
  });
}

// ── Audit log query helpers ────────────────────────────────────────────────────

/**
 * getAuditSummary — produce a human-readable audit summary.
 */
export function getAuditSummary(log: ReasoningAuditLog): {
  started:            boolean;
  completed:          boolean;
  failed:             boolean;
  totalEvents:        number;
  insightCount:       number;
  hypothesisCount:    number;
  contradictionCount: number;
  durationMs:         number;
} {
  const completed = log.events.find(e => e.eventType === "REASONING_COMPLETED");
  const failed    = log.events.some(e => e.eventType === "REASONING_FAILED");

  return {
    started:            log.events.some(e => e.eventType === "REASONING_STARTED"),
    completed:          !!completed,
    failed,
    totalEvents:        log.events.length,
    insightCount:       (completed?.metadata.insightCount as number) ?? 0,
    hypothesisCount:    (completed?.metadata.hypothesisCount as number) ?? 0,
    contradictionCount: (completed?.metadata.contradictionCount as number) ?? 0,
    durationMs:         (completed?.durationMs) ?? 0,
  };
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function _appendEvent(
  log:    ReasoningAuditLog,
  fields: Partial<ReasoningAuditEvent>,
): ReasoningAuditLog {
  const event: ReasoningAuditEvent = {
    eventId:   _eventId(),
    eventType: fields.eventType ?? "REASONING_STARTED",
    orgSlug:   log.orgSlug,
    queryId:   log.queryId,
    timestamp: new Date().toISOString(),
    durationMs: fields.durationMs,
    metadata:  fields.metadata ?? {},
  };
  return { ...log, events: [...log.events, event] };
}
