/**
 * lib/observability/operation-replay.ts
 *
 * Agentik — Operation Replay Foundation
 *
 * Sprint: AGENTIK-SECURITY-VAULT-AND-REAL-CONNECTORS-01 — Block C1
 *
 * Builds replay session records from execution trace snapshots.
 * Supports post-incident investigation, audit continuity, and supervised re-execution.
 *
 * V1: deterministic from execution trace + runtime state — no Prisma persistence.
 * V4: persisted to Prisma.OperationReplay, queryable by trace ID, incident ID, and date range.
 *
 * Replay is always read-only in V1 — no re-execution triggered from this layer.
 */

import type { ExecutionTrace } from "./execution-trace";

// ── Replay integrity ──────────────────────────────────────────────────────────────

export type ReplayIntegrity =
  | "intact"      // All spans present and accountable
  | "partial"     // Some spans missing but trace is usable
  | "incomplete"  // Critical spans missing — replay may be unreliable
  | "corrupt";    // Trace structure invalid

// ── Replay session ────────────────────────────────────────────────────────────────

export interface ReplaySession {
  replayId:          string;
  orgSlug:           string;
  sourceTraceId:     string;
  sourceSessionId:   string;
  agentId:           string;
  integrity:         ReplayIntegrity;
  integritySummary:  string;
  spanCount:         number;
  accountedSpans:    number;
  missingSpanNames:  string[];
  replayAvailable:   boolean;
  auditContinuity:   boolean;   // True when audit trail is unbroken
  incidentRef?:      string;    // Linked incident ID (if this replay was triggered by incident)
  createdAt:         string;    // ISO timestamp
  expiresAt:         string;    // ISO timestamp — replay window (24h in V1)
  summary:           string;
}

// ── Replay summary (pipeline-safe) ───────────────────────────────────────────────

export interface ReplaySessionSummary {
  replayId:        string;
  integrity:       ReplayIntegrity;
  integritySummary: string;
  spanCount:       number;
  accountedSpans:  number;
  replayAvailable: boolean;
  auditContinuity: boolean;
  createdAt:       string;
  summary:         string;
}

// ── Build replay session ──────────────────────────────────────────────────────────

/**
 * Builds a replay session record from an execution trace.
 * Evaluates trace integrity and determines if replay is available.
 */
export function buildReplaySession(
  trace:       ExecutionTrace,
  incidentRef?: string,
): ReplaySession {
  const replayId  = generateReplayId(trace.orgSlug, trace.traceId);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Required spans for audit continuity
  const REQUIRED_SPAN_IDS = [
    "span-signals",
    "span-context",
    "span-governance",
    "span-vault",
  ];

  const presentSpanIds   = new Set(trace.spans.map(s => s.id));
  const missingSpanIds   = REQUIRED_SPAN_IDS.filter(id => !presentSpanIds.has(id));
  const missingSpanNames = missingSpanIds.map(id => id.replace("span-", "").replace(/-/g, " "));
  const accountedSpans   = trace.spans.filter(s => s.status !== "pending").length;

  const integrity   = resolveReplayIntegrity(trace.spans.length, accountedSpans, missingSpanIds.length);
  const auditContinuity = missingSpanIds.length === 0 && integrity !== "corrupt";
  const replayAvailable = integrity !== "corrupt" && trace.overallStatus !== "error";

  const integritySummary =
    integrity === "intact"     ? `${accountedSpans} spans verificados — integridad completa`
    : integrity === "partial"  ? `${missingSpanIds.length} span${missingSpanIds.length > 1 ? "s" : ""} faltante${missingSpanIds.length > 1 ? "s" : ""} — replay parcialmente disponible`
    : integrity === "incomplete" ? `Spans críticos ausentes — replay limitado`
    : "Traza inválida — replay no disponible";

  const summary =
    !replayAvailable ? `Replay no disponible — ${integritySummary}`
    : !auditContinuity ? `Replay disponible con gaps de auditoría`
    : `Replay disponible — ${integritySummary}`;

  return {
    replayId,
    orgSlug:         trace.orgSlug,
    sourceTraceId:   trace.traceId,
    sourceSessionId: trace.sessionId,
    agentId:         trace.agentId,
    integrity,
    integritySummary,
    spanCount:       trace.spans.length,
    accountedSpans,
    missingSpanNames,
    replayAvailable,
    auditContinuity,
    incidentRef,
    createdAt,
    expiresAt,
    summary,
  };
}

// ── Resolve integrity ─────────────────────────────────────────────────────────────

/**
 * Resolves replay integrity level from span accounting.
 */
export function resolveReplayIntegrity(
  totalSpans:    number,
  accountedSpans: number,
  missingCriticalCount: number,
): ReplayIntegrity {
  if (totalSpans === 0) return "corrupt";
  if (missingCriticalCount >= 3) return "corrupt";
  if (missingCriticalCount >= 2) return "incomplete";
  const accountedRatio = accountedSpans / totalSpans;
  if (accountedRatio >= 0.9 && missingCriticalCount === 0) return "intact";
  if (accountedRatio >= 0.6) return "partial";
  return "incomplete";
}

// ── Summarize replay session ──────────────────────────────────────────────────────

/**
 * Returns a pipeline-safe summary of a replay session for rail display.
 */
export function summarizeReplaySession(session: ReplaySession): ReplaySessionSummary {
  return {
    replayId:         session.replayId,
    integrity:        session.integrity,
    integritySummary: session.integritySummary,
    spanCount:        session.spanCount,
    accountedSpans:   session.accountedSpans,
    replayAvailable:  session.replayAvailable,
    auditContinuity:  session.auditContinuity,
    createdAt:        session.createdAt,
    summary:          session.summary,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────────

function generateReplayId(orgSlug: string, traceId: string): string {
  const ts  = Date.now().toString(36);
  const org = orgSlug.slice(0, 4).replace(/[^a-z0-9]/gi, "x");
  return `rpl-${org}-${traceId.slice(0, 6)}-${ts}`;
}
